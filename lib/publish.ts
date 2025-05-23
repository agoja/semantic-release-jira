import JiraClient, { Version } from 'jira-connector';
import * as _ from 'lodash';
import pLimit from 'p-limit';

import { makeClient } from './jira';
import { DEFAULT_RELEASE_DESCRIPTION_TEMPLATE, DEFAULT_VERSION_TEMPLATE, GenerateNotesContext, PluginConfig } from './types';
import { escapeRegExp } from './util';

export function getTickets(config: PluginConfig, context: GenerateNotesContext): string[] {
  // Log for debugging
  console.log('DEBUG: getTickets called');
  context.logger.info('DEBUG: getTickets called with context and config');
  
  let patterns: RegExp[] = [];

  if (config.ticketRegex !== undefined) {
    patterns = [new RegExp(config.ticketRegex, 'giu')];
  } else {
    patterns = config.ticketPrefixes!
        .map(prefix => new RegExp(`\\b${escapeRegExp(prefix)}-(\\d+)\\b`, 'giu'));
  }

  const tickets = new Set<string>();
  for (const commit of context.commits) {
    for (const pattern of patterns) {
      const matches = commit.message.match(pattern);
      if (matches) {
        matches.forEach(match => {
          tickets.add(match);
          context.logger.info(`Found ticket ${matches} in commit: ${commit.commit.short}`);
          // Log for debugging
          console.log(`DEBUG: Found ticket ${matches} in commit: ${commit.commit.short}`);
        });
      }
    }
  }

  return [...tickets];
}

async function findOrCreateVersion(config: PluginConfig, context: GenerateNotesContext, jira: JiraClient, projectIdOrKey: string, name: string, description: string): Promise<Version> {
  // Log for debugging
  console.log(`DEBUG: findOrCreateVersion called for project ${projectIdOrKey}, version ${name}`);
  context.logger.info(`DEBUG: findOrCreateVersion called for project ${projectIdOrKey}, version ${name}`);
  
  const remoteVersions = await jira.project.getVersions({ projectIdOrKey });
  context.logger.info(`Looking for version with name '${name}'`);
  const existing = _.find(remoteVersions, { name });
  if (existing) {
    context.logger.info(`Found existing release '${existing.id}'`);
    return existing;
  }

  context.logger.info(`No existing release found, creating new`);

  let newVersion: Version;
  if (config.dryRun) {
    context.logger.info(`dry-run: making a fake release`);
    newVersion = {
      name,
      id: 'dry_run_id',
    } as any;
  } else {
    const descriptionText = description || '';
    newVersion = await jira.version.createVersion({
      name,
      projectId: projectIdOrKey as any,
      description: descriptionText,
      released: Boolean(config.released),
      releaseDate: config.setReleaseDate ? (new Date().toISOString()) : undefined,
    });
  }

  context.logger.info(`Made new release '${newVersion.id}'`);
  return newVersion;
}

async function editIssueFixVersions(config: PluginConfig, context: GenerateNotesContext, jira: JiraClient, newVersionName: string, releaseVersionId: string, issueKey: string): Promise<void> {
  try {
    context.logger.info(`Adding issue ${issueKey} to '${newVersionName}'`);
    console.log(`DEBUG: Adding issue ${issueKey} to '${newVersionName}'`);
    
    if (!config.dryRun) {
      await jira.issue.editIssue({
        issueKey,
        issue: {
          update: {
            fixVersions: [{
              add: { id: releaseVersionId },
            }],
          },
          properties: undefined as any,
        },
      });
    }
  } catch (err: any) {
    const allowedStatusCodes = [400, 404];
    let statusCode = err?.statusCode;
    if (typeof err === 'string') {
      try {
        const parsedError = JSON.parse(err);
        statusCode = statusCode || parsedError.statusCode;
      } catch (parseErr) {
          // it's not json :shrug:
      }
    }
    if (allowedStatusCodes.indexOf(statusCode) === -1) {
      throw err;
    }
    context.logger.error(`Unable to update issue ${issueKey} statusCode: ${statusCode}`);
    console.error(`DEBUG: Error updating issue ${issueKey} statusCode: ${statusCode}`);
  }
}

export async function publish(config: PluginConfig, context: GenerateNotesContext): Promise<void> {
  // Debug logs to verify the function is being called
  console.log('DEBUG: publish function called in @agoja/semantic-release-jira-update');
  console.log('DEBUG: context keys:', Object.keys(context));
  console.log('DEBUG: config keys:', Object.keys(config));
  
  try {
    context.logger.info('DEBUG: JIRA publish step started');
    
    const tickets = getTickets(config, context);

    if (tickets.length === 0) {
      context.logger.info('No Jira tickets found in commits, skipping release creation');
      console.log('DEBUG: No Jira tickets found in commits, skipping release creation');
      return;
    }

    context.logger.info(`Found tickets: ${tickets.join(', ')}`);
    console.log(`DEBUG: Found tickets: ${tickets.join(', ')}`);

    const versionTemplate = _.template(config.releaseNameTemplate ?? DEFAULT_VERSION_TEMPLATE);
    const newVersionName = versionTemplate({ version: context.nextRelease.version });

    const descriptionTemplate = _.template(config.releaseDescriptionTemplate ?? DEFAULT_RELEASE_DESCRIPTION_TEMPLATE);
    const newVersionDescription = descriptionTemplate({ version: context.nextRelease.version, notes: context.nextRelease.notes });

    context.logger.info(`Using jira release '${newVersionName}'`);
    console.log(`DEBUG: Using jira release '${newVersionName}'`);

    const jira = makeClient(config, context);

    const project = await jira.project.getProject({ projectIdOrKey: config.projectId });
    const releaseVersion = await findOrCreateVersion(config, context, jira, project.id, newVersionName, newVersionDescription);

    const concurrentLimit = pLimit(config.networkConcurrency || 10);

    const edits = tickets.map(issueKey =>
      concurrentLimit(() =>
        editIssueFixVersions(config, context, jira, newVersionName, releaseVersion.id, issueKey),
      ),
    );

    await Promise.all(edits);
    context.logger.info('JIRA release creation completed successfully');
    console.log('DEBUG: JIRA release creation completed successfully');
  } catch (error) {
    console.error('DEBUG ERROR in JIRA publish step:', error);
    context.logger.error('ERROR in JIRA publish step:', error);
    // Re-throw to ensure semantic-release knows there was a problem
    throw error;
  }
} 