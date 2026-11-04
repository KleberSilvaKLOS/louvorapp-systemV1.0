const SongModel = require('../models/SongModel');
const AuditService = require('../services/auditService');
const { requirePermission } = require('../middlewares/permissionMiddleware');
const { sendJson } = require('../middlewares/errorMiddleware');

const RepertoireController = {
  async list(req, res) {
    await requirePermission(req, 'repertoire', 'view');
    const songs = await SongModel.getAll({
      search: req.query.search || '',
      key: req.query.key || '',
      category: req.query.category || ''
    });
    sendJson(res, 200, { ok: true, songs });
  },

  async getOne(req, res) {
    await requirePermission(req, 'repertoire', 'view');
    const song = await SongModel.getById(req.params.id);
    if (!song) {
      const err = new Error('Música não encontrada.');
      err.status = 404;
      throw err;
    }
    sendJson(res, 200, { ok: true, song });
  },

  async create(req, res) {
    await requirePermission(req, 'repertoire', 'create');
    if (!req.body.title) {
      const err = new Error('O título da música é obrigatório.');
      err.status = 400;
      throw err;
    }
    const created = await SongModel.create(req.body, req.user.id);
    await AuditService.record(
      req,
      'CREATE_SONG',
      'song',
      created.id,
      `Cadastrou música no repertório: ${created.title} (Tom: ${created.musical_key})`
    );
    sendJson(res, 201, {
      ok: true,
      message: 'Música adicionada ao repertório!',
      song: created
    });
  },

  async update(req, res) {
    await requirePermission(req, 'repertoire', 'edit');
    const updated = await SongModel.update(req.params.id, req.body);
    if (!updated) {
      const err = new Error('Música não encontrada.');
      err.status = 404;
      throw err;
    }
    await AuditService.record(
      req,
      'UPDATE_SONG',
      'song',
      updated.id,
      `Atualizou música: ${updated.title} (Tom: ${updated.musical_key})`
    );
    sendJson(res, 200, {
      ok: true,
      message: 'Música atualizada com sucesso!',
      song: updated
    });
  },

  async remove(req, res) {
    await requirePermission(req, 'repertoire', 'delete');
    const song = await SongModel.getById(req.params.id);
    if (!song) {
      const err = new Error('Música não encontrada.');
      err.status = 404;
      throw err;
    }
    await SongModel.delete(req.params.id);
    await AuditService.record(req, 'DELETE_SONG', 'song', req.params.id, `Excluiu música: ${song.title}`);
    sendJson(res, 200, {
      ok: true,
      message: 'Música removida do repertório!'
    });
  }
};

module.exports = RepertoireController;
