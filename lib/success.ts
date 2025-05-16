import axios from 'axios';
import { GenerateNotesContext, PluginConfig } from './types';

/**
 * Send a notification to Microsoft Teams when a release is successful
 * 
 * @param config Plugin configuration
 * @param context Release context
 */
export async function success(config: PluginConfig, context: GenerateNotesContext): Promise<void> {
  console.log('DEBUG: success hook called in @agoja/semantic-release-jira-update');
  
  // Make sure we have a Teams webhook URL
  if (!context.env.TEAMS_WEBHOOK_URL) {
    console.log('DEBUG: No TEAMS_WEBHOOK_URL environment variable found, skipping Teams notification');
    context.logger.info('No TEAMS_WEBHOOK_URL environment variable found, skipping Teams notification');
    return;
  }

  try {
    const webhookUrl = context.env.TEAMS_WEBHOOK_URL;
    const { nextRelease, lastRelease, commits } = context;
    
    // Extract ticket numbers from commits
    const tickets = new Set<string>();
    let ticketRegex: RegExp | null = null;
    
    if (config.ticketRegex) {
      ticketRegex = new RegExp(config.ticketRegex, 'gi');
    } else if (config.ticketPrefixes && config.ticketPrefixes.length > 0) {
      const prefixPattern = config.ticketPrefixes.map(p => p.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|');
      ticketRegex = new RegExp(`(${prefixPattern})-\\d+`, 'gi');
    }
    
    if (ticketRegex) {
      for (const commit of commits) {
        const matches = [...commit.message.matchAll(ticketRegex)];
        for (const match of matches) {
          tickets.add(match[0]);
        }
      }
    }
    
    // Format for Power Automate adaptive card webhook
    const adaptiveCard = {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.2",
            body: [
              {
                type: "TextBlock",
                size: "Large",
                weight: "Bolder",
                text: `🚀 Release ${nextRelease.version} published`
              },
              {
                type: "TextBlock",
                text: `JIRA Project: ${config.projectId}`,
                wrap: true
              },
              {
                type: "FactSet",
                facts: [
                  {
                    title: "Version",
                    value: nextRelease.version
                  },
                  {
                    title: "Previous version",
                    value: lastRelease.version || "None"
                  },
                  {
                    title: "Type",
                    value: nextRelease.type
                  },
                  {
                    title: "Git tag",
                    value: nextRelease.gitTag
                  },
                  {
                    title: "Commits",
                    value: commits.length.toString()
                  },
                  {
                    title: "Related tickets",
                    value: tickets.size > 0 ? Array.from(tickets).join(', ') : "None"
                  }
                ]
              }
            ]
          }
        }
      ]
    };
    
    // Add release notes if available
    if (nextRelease.notes) {
      const shortenedNotes = nextRelease.notes.length > 1000 
        ? nextRelease.notes.substring(0, 997) + '...' 
        : nextRelease.notes;
        
      adaptiveCard.attachments[0].content.body.push({
        type: "TextBlock",
        size: "Medium",
        weight: "Bolder",
        text: "Release Notes"
      });
      
      adaptiveCard.attachments[0].content.body.push({
        type: "TextBlock",
        text: shortenedNotes,
        wrap: true
      });
    }
    
    console.log(`DEBUG: Sending Teams notification for release ${nextRelease.version}`);
    context.logger.info(`Sending Teams notification for release ${nextRelease.version}`);
    console.log(`DEBUG: Teams message payload:`, JSON.stringify(adaptiveCard, null, 2));
    
    // Don't send actual request in dry run mode
    if (!config.dryRun) {
      try {
        const response = await axios.post(webhookUrl, adaptiveCard);
        console.log(`DEBUG: Teams notification sent, status: ${response.status}`);
        context.logger.info(`Teams notification sent successfully`);
      } catch (error: any) {
        console.error(`DEBUG: Error sending Teams notification: ${error.message || error}`);
        if (error.response) {
          console.error(`DEBUG: Response data:`, error.response.data);
          console.error(`DEBUG: Response status:`, error.response.status);
          console.error(`DEBUG: Response headers:`, error.response.headers);
        }
        
        // Try with a simpler format as fallback - MS Teams direct format
        try {
          console.log('DEBUG: Trying fallback with MS Teams MessageCard format');
          
          const messageCard = {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "themeColor": "0076D7",
            "summary": `Release ${nextRelease.version} published`,
            "sections": [
              {
                "activityTitle": `🚀 Release ${nextRelease.version} published`,
                "activitySubtitle": `JIRA Project: ${config.projectId}`,
                "facts": [
                  {
                    "name": "Version",
                    "value": nextRelease.version
                  },
                  {
                    "name": "Previous version",
                    "value": lastRelease.version || "None"
                  },
                  {
                    "name": "Type",
                    "value": nextRelease.type
                  },
                  {
                    "name": "Git tag",
                    "value": nextRelease.gitTag
                  },
                  {
                    "name": "Commits",
                    "value": commits.length.toString()
                  },
                  {
                    "name": "Related tickets",
                    "value": tickets.size > 0 ? Array.from(tickets).join(', ') : "None"
                  }
                ],
                "markdown": true
              }
            ]
          };
          
          // Add release notes if available
          if (nextRelease.notes) {
            const shortenedNotes = nextRelease.notes.length > 1000 
              ? nextRelease.notes.substring(0, 997) + '...' 
              : nextRelease.notes;
              
            // @ts-ignore - The MessageCard format allows adding arbitrary sections
            messageCard.sections.push({
              "activityTitle": "Release Notes",
              "activitySubtitle": shortenedNotes,
              "markdown": true
            });
          }
          
          const fallbackResponse = await axios.post(webhookUrl, messageCard);
          console.log(`DEBUG: MessageCard fallback sent, status: ${fallbackResponse.status}`);
          context.logger.info(`Teams notification sent successfully using MessageCard fallback`);
        } catch (fallbackError: any) {
          // Final attempt with plain text
          try {
            console.log('DEBUG: Trying last fallback with plain text format');
            
            const textMessage = {
              "text": `**🚀 Release ${nextRelease.version} published**\n\n` +
                     `**Project:** ${config.projectId}\n` +
                     `**Version:** ${nextRelease.version}\n` +
                     `**Previous version:** ${lastRelease.version || "None"}\n` +
                     `**Type:** ${nextRelease.type}\n` +
                     `**Commits:** ${commits.length}\n` +
                     `**Related tickets:** ${tickets.size > 0 ? Array.from(tickets).join(', ') : "None"}\n\n` +
                     (nextRelease.notes ? `**Release Notes:**\n\n${nextRelease.notes}` : '')
            };
            
            const textResponse = await axios.post(webhookUrl, textMessage);
            console.log(`DEBUG: Text fallback sent, status: ${textResponse.status}`);
            context.logger.info(`Teams notification sent successfully using text fallback`);
          } catch (textError: any) {
            console.error(`DEBUG: All Teams notification formats failed`);
            context.logger.error(`Teams notification failed: ${textError.message || textError}`);
          }
        }
      }
    } else {
      console.log('DEBUG: Dry run - not sending actual Teams notification');
      context.logger.info('Dry run - Teams notification would be sent here');
    }
  } catch (error: any) {
    console.error(`DEBUG: Error in Teams notification: ${error.message || error}`);
    context.logger.error(`Error in Teams notification: ${error.message || error}`);
    // Don't throw error to avoid failing the release process
  }
} 