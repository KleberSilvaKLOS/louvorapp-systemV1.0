const db = require('../config/database');

const SongModel = {
  async getAll({ search = '', key = '', category = '' } = {}) {
    let sql = 'SELECT * FROM songs WHERE 1=1';
    const params = [];
    if (search) {
      sql += ' AND (LOWER(title) LIKE LOWER(?) OR LOWER(artist) LIKE LOWER(?) OR LOWER(notes) LIKE LOWER(?))';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (key) {
      sql += ' AND UPPER(musical_key) = UPPER(?)';
      params.push(key);
    }
    if (category) {
      sql += ' AND LOWER(category) = LOWER(?)';
      params.push(category);
    }
    sql += ' ORDER BY title ASC';
    return db.all(sql, params);
  },

  async getById(id) {
    return db.get('SELECT * FROM songs WHERE id = ?', [id]);
  },

  async create(data, userId) {
    const res = await db.run(
      `INSERT INTO songs (title, artist, musical_key, bpm, duration, category, chords_text, audio_url, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.title,
        data.artist || 'Ministério de Louvor',
        data.musical_key || 'G',
        parseInt(data.bpm || 70, 10),
        data.duration || '05:30',
        data.category || 'Adoração',
        data.chords_text || '',
        data.audio_url || '',
        data.notes || '',
        userId
      ]
    );
    return this.getById(res.lastID);
  },

  async update(id, data) {
    const song = await this.getById(id);
    if (!song) return null;
    await db.run(
      `UPDATE songs SET
        title = COALESCE(?, title),
        artist = COALESCE(?, artist),
        musical_key = COALESCE(?, musical_key),
        bpm = COALESCE(?, bpm),
        duration = COALESCE(?, duration),
        category = COALESCE(?, category),
        chords_text = COALESCE(?, chords_text),
        audio_url = COALESCE(?, audio_url),
        notes = COALESCE(?, notes),
        updated_at = datetime('now')
       WHERE id = ?`,
      [
        data.title ?? null,
        data.artist ?? null,
        data.musical_key ?? null,
        data.bpm !== undefined ? parseInt(data.bpm, 10) : null,
        data.duration ?? null,
        data.category ?? null,
        data.chords_text ?? null,
        data.audio_url ?? null,
        data.notes ?? null,
        id
      ]
    );
    return this.getById(id);
  },

  async delete(id) {
    return db.run('DELETE FROM songs WHERE id = ?', [id]);
  }
};

module.exports = SongModel;
