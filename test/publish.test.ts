import { publish, getTickets } from '../lib/publish';
import { PluginConfig, GenerateNotesContext } from '../lib/types';

// Mock the makeClient function
jest.mock('../lib/jira', () => ({
  makeClient: jest.fn().mockReturnValue({
    project: {
      getProject: jest.fn().mockResolvedValue({ id: 'test-project-id' }),
      getVersions: jest.fn().mockResolvedValue([]),
    },
    version: {
      createVersion: jest.fn().mockResolvedValue({ id: 'test-version-id', name: 'v1.0.0' }),
    },
    issue: {
      editIssue: jest.fn().mockResolvedValue({}),
    },
  }),
}));

describe('publish', () => {
  const mockConfig: Partial<PluginConfig> = {
    jiraHost: 'test.atlassian.net',
    projectId: 'TEST',
    ticketPrefixes: ['TEST'],
    dryRun: false,
  };

  const mockContext: Partial<GenerateNotesContext> = {
    commits: [
      {
        message: 'fix: TEST-123 Fix a bug',
        commit: {
          short: 'a1b2c3d',
          long: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
        },
      } as any,
    ],
    nextRelease: {
      version: '1.0.0',
      notes: 'Release notes for v1.0.0',
      gitTag: 'v1.0.0',
      gitHead: 'a1b2c3d',
      type: 'patch',
    } as any,
    logger: {
      info: jest.fn(),
      error: jest.fn(),
    } as any,
  };

  it('should extract Jira ticket references from commit messages', () => {
    const tickets = getTickets(mockConfig as PluginConfig, mockContext as GenerateNotesContext);
    expect(tickets).toContain('TEST-123');
  });

  it('should call publish without error', async () => {
    await expect(publish(
      mockConfig as PluginConfig, 
      mockContext as GenerateNotesContext,
    )).resolves.not.toThrow();
  });
}); 