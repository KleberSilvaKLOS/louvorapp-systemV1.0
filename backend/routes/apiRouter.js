const AuthController = require('../controllers/authController');
const ScheduleController = require('../controllers/scheduleController');
const SwapController = require('../controllers/swapController');
const PollController = require('../controllers/pollController');
const RepertoireController = require('../controllers/repertoireController');
const UserController = require('../controllers/userController');
const SettingsController = require('../controllers/settingsController');
const { requireAuth } = require('../middlewares/authMiddleware');
const { sendJson } = require('../middlewares/errorMiddleware');

class Router {
  constructor() {
    this.routes = [];
  }

  register(method, pattern, handler, authRequired = true) {
    const paramNames = [];
    const regexPath = pattern.replace(/:([a-zA-Z0-9_]+)/g, (_, paramName) => {
      paramNames.push(paramName);
      return '([^/]+)';
    });
    const regex = new RegExp(`^${regexPath}$`);
    this.routes.push({ method: method.toUpperCase(), regex, paramNames, handler, authRequired });
  }

  async handle(req, res, pathname, query) {
    const method = req.method.toUpperCase();
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const match = pathname.match(r.regex);
      if (!match) continue;

      const params = {};
      r.paramNames.forEach((name, idx) => {
        params[name] = decodeURIComponent(match[idx + 1]);
      });
      req.params = params;
      req.query = query;

      if (r.authRequired) {
        await requireAuth(req, res);
      }
      return r.handler(req, res);
    }

    sendJson(res, 404, { ok: false, error: `Rota de API não encontrada: ${method} ${pathname}` });
  }
}

const apiRouter = new Router();

// Healthcheck
apiRouter.register('GET', '/api/health', async (req, res) => {
  sendJson(res, 200, { ok: true, status: 'healthy', version: '2.5.0', timestamp: new Date().toISOString() });
}, false);

// Public Settings (banner de ensaio e nome do ministério)
apiRouter.register('GET', '/api/settings/public', SettingsController.getPublicInfo, false);

// Auth Routes
apiRouter.register('POST', '/api/auth/register', AuthController.register, false);
apiRouter.register('POST', '/api/auth/login', AuthController.login, false);
apiRouter.register('POST', '/api/auth/forgot-password', AuthController.forgotPassword, false);
apiRouter.register('POST', '/api/auth/reset-password', AuthController.resetPassword, false);
apiRouter.register('POST', '/api/auth/logout', AuthController.logout, true);
apiRouter.register('GET', '/api/auth/me', AuthController.me, true);
apiRouter.register('POST', '/api/auth/change-password', AuthController.changePassword, true);

// Schedules & Calendar Routes
apiRouter.register('GET', '/api/schedules', ScheduleController.list, true);
apiRouter.register('GET', '/api/schedules/my', ScheduleController.mySchedules, true);
apiRouter.register('GET', '/api/schedules/ics', ScheduleController.exportIcs, true);
apiRouter.register('GET', '/api/schedules/:id', ScheduleController.getOne, true);
apiRouter.register('POST', '/api/schedules', ScheduleController.create, true);
apiRouter.register('PUT', '/api/schedules/:id', ScheduleController.update, true);
apiRouter.register('DELETE', '/api/schedules/:id', ScheduleController.remove, true);
apiRouter.register('POST', '/api/schedules/:id/members', ScheduleController.addMember, true);
apiRouter.register('DELETE', '/api/schedules/:id/members/:memberId', ScheduleController.removeMember, true);
apiRouter.register('POST', '/api/schedules/:id/attendance', ScheduleController.respondAttendance, true);
apiRouter.register('POST', '/api/schedules/:id/notify', ScheduleController.notifyTeam, true);

// Swaps & Leader Approval Routes
apiRouter.register('GET', '/api/swaps', SwapController.list, true);
apiRouter.register('POST', '/api/swaps', SwapController.create, true);
apiRouter.register('POST', '/api/swaps/batch-approve', SwapController.batchSmartApprove, true);
apiRouter.register('POST', '/api/swaps/:id/confirm-leader', SwapController.confirmWithLeader, true);
apiRouter.register('POST', '/api/swaps/:id/cancel', SwapController.cancel, true);
apiRouter.register('POST', '/api/swaps/:id/resolve', SwapController.resolve, true);
apiRouter.register('POST', '/api/swaps/:id/alert', SwapController.dispatchAlert, true);

// Polls Routes
apiRouter.register('GET', '/api/polls', PollController.list, true);
apiRouter.register('GET', '/api/polls/:id/votes', PollController.getVotesDetail, true);
apiRouter.register('POST', '/api/polls', PollController.create, true);
apiRouter.register('POST', '/api/polls/:id/vote', PollController.vote, true);
apiRouter.register('POST', '/api/polls/:id/generate-roster', PollController.generateRoster, true);
apiRouter.register('PUT', '/api/polls/:id/status', PollController.updateStatus, true);
apiRouter.register('DELETE', '/api/polls/:id', PollController.remove, true);

// Repertoire / Songs Routes
apiRouter.register('GET', '/api/repertoire', RepertoireController.list, true);
apiRouter.register('GET', '/api/repertoire/:id', RepertoireController.getOne, true);
apiRouter.register('POST', '/api/repertoire', RepertoireController.create, true);
apiRouter.register('PUT', '/api/repertoire/:id', RepertoireController.update, true);
apiRouter.register('DELETE', '/api/repertoire/:id', RepertoireController.remove, true);

// Users, Skills, Unavailabilities & Notifications Routes
apiRouter.register('GET', '/api/users/profile', UserController.getMyProfile, true);
apiRouter.register('PUT', '/api/users/profile', UserController.updateMyProfile, true);
apiRouter.register('GET', '/api/users/unavailabilities', UserController.listUnavailabilities, true);
apiRouter.register('POST', '/api/users/unavailabilities', UserController.addMyUnavailability, true);
apiRouter.register('DELETE', '/api/users/unavailabilities/:unavailabilityId', UserController.deleteMyUnavailability, true);
apiRouter.register('POST', '/api/users/skills', UserController.addMySkill, true);
apiRouter.register('PUT', '/api/users/skills/:skillId', UserController.updateMySkill, true);
apiRouter.register('DELETE', '/api/users/skills/:skillId', UserController.deleteMySkill, true);
apiRouter.register('GET', '/api/users/notifications', UserController.listNotifications, true);
apiRouter.register('POST', '/api/users/notifications/read', UserController.markNotificationsRead, true);
apiRouter.register('GET', '/api/users', UserController.listAllUsers, true);
apiRouter.register('POST', '/api/users', UserController.adminCreateUser, true);
apiRouter.register('PUT', '/api/users/:id', UserController.adminUpdateUser, true);
apiRouter.register('DELETE', '/api/users/:id', UserController.adminDeleteUser, true);

// Settings & Permissions Matrix Routes
apiRouter.register('GET', '/api/settings', SettingsController.getAll, true);
apiRouter.register('PUT', '/api/settings', SettingsController.updateSettings, true);
apiRouter.register('PUT', '/api/settings/permissions', SettingsController.updatePermissions, true);

module.exports = apiRouter;
