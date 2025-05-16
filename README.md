# @agoja/semantic-release-jira-update

**semantic-release** plugin to publish a JIRA release. Updated for semantic-release v19+ with modern hooks.

| Step             | Description                                                               |
| ---------------- | ------------------------------------------------------------------------- |
| verifyConditions | Validate the config options and check for a JIRA_AUTH in the environment  |
| publish          | Find all tickets from commits and add them to a new release on JIRA       |
| success          | Send a notification to Microsoft Teams when a release is successful       |

## Install

```bash
$ npm install --save-dev @agoja/semantic-release-jira-update
# or
$ yarn add --dev @agoja/semantic-release-jira-update
```

### Configuration

The plugin should be added to your config

```json
{
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/git",
    ["@agoja/semantic-release-jira-update", {
      "projectId": "UH",
      "releaseNameTemplate": "Test v${version}",
      "jiraHost": "uphabit.atlassian.net",
      "ticketPrefixes": [ "TEST", "UH"],
      "ticketRegex": "[a-zA-Z]{3,5}-\\d{3,5}",
      "released": true,
      "setReleaseDate": true
    }]
  ]
}
```

Please note that `ticketRegex` cannot be used together with `ticketPrefixes`.

## Environment Variables

### Required

- `JIRA_AUTH`: A Base64 encoded string of your Jira credentials (`username:apiToken`)

### Optional

- `TEAMS_WEBHOOK_URL`: Microsoft Teams webhook URL for notifications. If provided, a notification will be sent to Teams when a release is successful.

## API

```typescript
interface Config {
  /**
   * A domain of a jira instance ie: `uphabit.atlasian.net`
   */
  jiraHost: string;

  /**
   * A list of prefixes to match when looking for tickets in commits. Cannot be used together with ticketRegex.
   *
   * ie. ['TEST'] would match `TEST-123` and `TEST-456`
   */
  ticketPrefixes?: string[];

  /**
   * A unescaped regex to match tickets in commits (without slashes). Cannot be used together with ticketPrefixes.
   *
   * ie. [a-zA-Z]{4}-\d{3,5} would match any ticket with 3 letters a dash and 3 to 5 numbers, such as `TEST-456`, `TEST-5643` and `TEST-56432`
   */
  ticketRegex?: string;

  /**
   * The id or key for the project releases will be created in
   */
  projectId: string;

  /**
   * A lodash template with a single `version` variable
   * defaults to `v${version}` which results in a version that is named like `v1.0.0`
   * ex: `Semantic Release v${version}` results in `Semantic Release v1.0.0`
   *
   * @default `v${version}`
   */
  releaseNameTemplate?: string;

  /**
   * A lodash template for the release.description field
   *
   * template variables:
   *    version: the sem-ver version ex.: 1.2.3
   *      notes: The full release notes: This may be very large
   *             Only use it if you have very small releases
   *
   * @default `Automated released with semantic-release-jira https://github.com/agoja/semantic-release-jira`
   */
  releaseDescriptionTemplate?: string;

  /**
   * The number of maximum parallel network calls, default 10
   */
  networkConcurrency?: number;

  /**
   * indicates if a new release created in jira should be set as released
   */
  released?: boolean;
  /**
   * include the release date when creating a release in jira
   */
  setReleaseDate?: boolean;
}
```

## Features

1. **JIRA Integration**: Creates a new version in JIRA and associates tickets mentioned in commits with that version
2. **Microsoft Teams Notifications**: Sends a notification to Microsoft Teams when a release is successful (requires the TEAMS_WEBHOOK_URL environment variable)
3. **Release Date Support**: Optionally mark releases with the current date
4. **Released Status**: Optionally mark releases as "released" in JIRA

## About

This is a modern fork of [semantic-release-jira-releases](https://github.com/UpHabit/semantic-release-jira-releases) updated to work with semantic-release v19+ by using the publish hook instead of the deprecated success hook. The plugin automatically creates releases in Jira and links all referenced tickets in commit messages to that release.

## Publishing

This package is published under the `@agoja` scope on npm and can be used in any project that requires integration between semantic-release and Jira.