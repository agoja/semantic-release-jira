import { verifyConditions } from './verifyConditions';
import { publish } from './publish';
import { success } from './success';

// Implementation following the semantic-release plugin guide
// https://github.com/semantic-release/semantic-release/blob/master/docs/developer-guide/plugin.md
export = {
  verifyConditions,
  publish,
  success
};
