/**
 * Insert await before async db() calls in route handlers.
 * Skips lines that already contain "await " before the call (heuristic).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NAMES = [
  'initDb',
  'getPostsWithHolders',
  'getPostsForUser',
  'getPostById',
  'createPost',
  'updatePost',
  'deletePosts',
  'getUsers',
  'getAdminAssignedAt',
  'getAdminPostIdForUser',
  'getAdminPostIds',
  'getUsersWithRoles',
  'setUserPostId',
  'assignUserToPost',
  'vacatePost',
  'deleteUser',
  'postHasChildren',
  'getDepartments',
  'createDepartment',
  'updateDepartment',
  'deleteDepartment',
  'getPostSubtreeIds',
  'getAncestorPostIds',
  'getAllowListForUser',
  'getInstructions',
  'getInstructionById',
  'createInstruction',
  'updateInstruction',
  'deleteInstruction',
  'getInstructionSteps',
  'createInstructionStep',
  'updateInstructionStep',
  'getInstructionStepById',
  'deleteInstructionStep',
  'getMetricDefinitions',
  'createMetricDefinition',
  'deleteMetricDefinition',
  'getStatisticsByPostId',
  'getStatisticsRecords',
  'createStatisticRecord',
  'getStatisticsSeries',
  'getQuotas',
  'setQuota',
  'getConstructorView',
  'getMetricToPostList',
  'setMetricToPost',
  'deleteMetricToPost',
  'canUserEditMetricAssignment',
  'getDailyTrackingData',
  'saveDailyEntry',
  'getStatisticsGridData',
  'getStatisticsGridDataByPeriod',
  'getSeriesLast30Days',
  'getWeekOverWeekGrowth',
  'getPlanVsFactLast7Days',
  'getBudgets',
  'getBudgetById',
  'approveBudget',
  'createBudget',
  'deleteBudget',
  'createWorkPlan',
  'getWorkPlanById',
  'updateWorkPlan',
  'submitWorkPlan',
  'approveWorkPlan',
  'rejectWorkPlan',
  'requestRevisionWorkPlan',
  'getWorkPlans',
  'getWorkPlanTasks',
  'createWorkPlanTask',
  'updateWorkPlanTask',
  'deleteWorkPlanTask',
  'deleteWorkPlan',
  'createWorkPlanNotification',
  'getWorkPlanNotificationCount',
  'getWorkPlanNotifications',
  'markWorkPlanNotificationAsRead',
  'markAllWorkPlanNotificationsAsRead',
  'createMailboxMessage',
  'createMessageAttachment',
  'getAttachmentsByMessageId',
  'getAttachmentById',
  'getUnreadCountForUser',
  'getMessageRecipientPostId',
  'markMailboxMessageAsRead',
  'archiveMailboxMessage',
  'archiveMailboxMessagesBulk',
  'deleteMailboxMessages',
  'clearMailboxFolder',
  'getMailboxMessages',
  'getMailboxMessageById',
  'getRecentAuditLog',
  'getAuditLogByPostId',
  'appendAuditLog',
  'createUser',
  'getUserById',
  'getUserByPostId',
  'getUserByEmailForLogin',
  // org.ts aliases
  'dbCreateDepartment',
  'dbUpdateDepartment',
  'dbDeleteDepartment',
  'dbCreatePost',
  'dbUpdatePost',
  'dbDeletePosts',
  'dbAssignUserToPost',
  'dbVacatePost',
  'dbDeleteUser',
];

function processLine(line) {
  let out = line;
  for (const name of NAMES) {
    const re = new RegExp(`(^|[^\\w$])(${name})\\(`, 'g');
    out = out.replace(re, (m, pre, fn) => {
      const before = pre + fn;
      // already awaited nearby (same segment before paren)
      const idx = out.indexOf(m);
      const slice = out.slice(Math.max(0, idx - 7), idx + fn.length);
      if (slice.includes('await ')) return m;
      return `${pre}await ${fn}(`;
    });
  }
  return out;
}

function processFile(filePath) {
  let s = fs.readFileSync(filePath, 'utf8');
  const lines = s.split('\n');
  const out = lines.map((line) => {
    if (line.trim().startsWith('import ') || line.includes(' from \'../db\'')) return line;
    return processLine(line);
  });
  fs.writeFileSync(filePath, out.join('\n'));
}

const routesDir = path.join(__dirname, '..', 'src', 'routes');
for (const f of fs.readdirSync(routesDir)) {
  if (!f.endsWith('.ts')) continue;
  processFile(path.join(routesDir, f));
}
console.log('Patched routes with await on db calls');
