const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const db = require("./db");

const app = express();
const port = process.env.PORT || 3001;
const secretKey = process.env.JWT_SECRET || "hkalshd9832yhui234hg234gjksdfsdnbnsvoisdsii";

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const dirs = [
  path.join(__dirname, "uploads", "ktp"),
  path.join(__dirname, "img", "product"),
  path.join(__dirname, "img", "profile_image"),
];
for (const dir of dirs) fs.mkdirSync(dir, { recursive: true });

app.use("/img", express.static(path.join(__dirname, "img")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/ktp/"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `ktp_${Date.now()}${ext}`);
  },
});

const storageProduk = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "img/product/"),
  filename: (req, file, cb) => {
    let namaProduk = req.body.nama || "produk";
    namaProduk = namaProduk
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${namaProduk}_${Date.now()}${ext}`);
  },
});
const uploadProduk = multer({ storage: storageProduk });

const storageProfileImage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "img/profile_image/"),
  filename: (req, file, cb) => {
    try {
      let namaUser = req.body.nama || "user";
      namaUser = namaUser
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `profile_${namaUser}_${Date.now()}${ext}`);
    } catch (err) {
      cb(err);
    }
  },
});

const fileFilterProfileImage = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;
  if (allowedTypes.test(ext) && allowedTypes.test(mime)) cb(null, true);
  else cb(new Error("File harus berupa gambar (jpg, jpeg, png, webp)"));
};

const uploadProfileImage = multer({
  storage: storageProfileImage,
  fileFilter: fileFilterProfileImage,
  limits: { fileSize: 2 * 1024 * 1024 },
});

function authenticateToko(req, res, next) {
  const token = req.headers.token;
  if (token == null) return res.status(401).json({ success: false, message: "Unauthorized" });

  jwt.verify(token, secretKey, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: "Forbidden" });
    req.user = user;
    if (user.buka_toko == 1) next();
    else return res.status(403).json({ success: false, message: "Forbidden" });
  });
}

function authenticateAdmin(req, res, next) {
  const token = req.headers.token;
  if (token == null) return res.status(401).json({ success: false, message: "Unauthorized" });

  jwt.verify(token, secretKey, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: "Forbidden" });
    req.user = user;
    if (user.role === 10) next();
    else return res.status(403).json({ success: false, message: "Forbidden" });
  });
}

function authenticateUser(req, res, next) {
  const token = req.headers.token;
  if (token == null) return res.status(401).json({ success: false, message: "Unauthorized" });

  jwt.verify(token, secretKey, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: "Forbidden" });
    req.user = user;
    next();
  });
}

function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) ? id : null;
}

app.get("/", (req, res) => res.send("API Connected"));

app.get("/pict/:id_product/:filename", (req, res) => {
  const { id_product, filename } = req.params;
  const filePath = path.join(__dirname, "img", "product", id_product, filename);
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ success: false, message: "File tidak ditemukan" });
    }
  });
});

// ==================== USERS ====================
app.get("/api/v1/users/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ success: false, message: "ID tidak valid" });

    const userResult = await db.query(`
      SELECT id, "firstName", "lastName", email, telp, nama_toko,
             klasifikasi_toko, rating_toko, buka_toko
      FROM "Users"
      WHERE id = $1
    `, [id]);

    if (userResult.rows.length === 0) {
      return res.status(404).send({ success: false, message: "User tidak ditemukan" });
    }

    const alamatResult = await db.query(`
      SELECT
        a.id,
        a."kodeProv" AS "kodeProv",
        a."kodeKab" AS "kodeKab",
        a."kodeKec" AS "kodeKec",
        a."kodeDesa" AS "kodeDesa",
        a."kodePos" AS "kode_pos",
        a.detail,
        p.nama AS provinsi,
        k.nama AS kabupaten,
        kc.nama AS kecamatan,
        d.nama AS desa
      FROM "Alamat" a
      LEFT JOIN "Provinsi" p ON a."kodeProv" = p.kode
      LEFT JOIN "Kabupaten" k
        ON a."kodeProv" = k."kodeProv" AND a."kodeKab" = k.kode
      LEFT JOIN "Kecamatan" kc
        ON a."kodeProv" = kc."kodeProv"
       AND a."kodeKab" = kc."kodeKab"
       AND a."kodeKec" = kc.kode
      LEFT JOIN "Desa" d
        ON a."kodeProv" = d."kodeProv"
       AND a."kodeKab" = d."kodeKab"
       AND a."kodeKec" = d."kodeKec"
       AND a."kodeDesa" = d.kode
      WHERE a."userId" = $1
      ORDER BY a.id
    `, [id]);

    const user = { ...userResult.rows[0], alamat: alamatResult.rows };
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan" });
  }
});

app.get("/api/v1/prov", async (req, res) => {
  try {
    const result = await db.query(`SELECT kode, nama FROM "Provinsi" ORDER BY nama`);
    res.status(200).send({ success: true, data: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Terjadi kesalahan" });
  }
});

app.get("/api/v1/kab/:kode_prov", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT kode, nama FROM "Kabupaten"
      WHERE "kodeProv" = $1 ORDER BY nama
    `, [req.params.kode_prov]);
    res.status(200).send({ success: true, data: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Terjadi kesalahan" });
  }
});

app.get("/api/v1/kec/:kode_prov/:kode_kab", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT kode, nama FROM "Kecamatan"
      WHERE "kodeProv" = $1 AND "kodeKab" = $2 ORDER BY nama
    `, [req.params.kode_prov, req.params.kode_kab]);
    res.status(200).send({ success: true, data: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Terjadi kesalahan" });
  }
});

app.get("/api/v1/desa/:kode_prov/:kode_kab/:kode_kec", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT kode, nama FROM "Desa"
      WHERE "kodeProv" = $1 AND "kodeKab" = $2 AND "kodeKec" = $3
      ORDER BY nama
    `, [req.params.kode_prov, req.params.kode_kab, req.params.kode_kec]);
    res.status(200).send({ success: true, data: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Terjadi kesalahan" });
  }
});

app.get("/api/v1/alamat/:id_user", async (req, res) => {
  try {
    const userId = parseId(req.params.id_user);
    if (userId === null) return res.status(400).json({ success: false, message: "ID tidak valid" });

    const result = await db.query(`
      SELECT
        a.id, a.detail, a.is_default, a.nama, a.bangunan, a.notelp,
        a.is_toko, a."kodePos" AS "kodePos",
        p.nama AS provinsi,
        k.nama AS kabupaten,
        kc.nama AS kecamatan,
        d.nama AS desa
      FROM "Alamat" a
      LEFT JOIN "Provinsi" p ON a."kodeProv" = p.kode
      LEFT JOIN "Kabupaten" k
        ON a."kodeProv" = k."kodeProv" AND a."kodeKab" = k.kode
      LEFT JOIN "Kecamatan" kc
        ON a."kodeProv" = kc."kodeProv"
       AND a."kodeKab" = kc."kodeKab"
       AND a."kodeKec" = kc.kode
      LEFT JOIN "Desa" d
        ON a."kodeProv" = d."kodeProv"
       AND a."kodeKab" = d."kodeKab"
       AND a."kodeKec" = d."kodeKec"
       AND a."kodeDesa" = d.kode
      WHERE a."userId" = $1
      ORDER BY a.id
    `, [userId]);

    res.status(200).send({ success: true, data: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Terjadi kesalahan" });
  }
});

app.get("/api/v1/users", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, "firstName", "lastName", email, telp, nama_toko,
             klasifikasi_toko, rating_toko, buka_toko
      FROM "Users"
      ORDER BY id
    `);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan" });
  }
});

// ==================== PRODUCTS ====================
app.get("/api/v1/product", async (req, res) => {
  try {
    const { total, page, orderBy, keyword, idToko, kategori } = req.query;
    const limit = Number.parseInt(total, 10) || 10;
    const pageNumber = Number.parseInt(page, 10) || 1;
    const offset = (pageNumber - 1) * limit;
    const params = [];
    const conditions = [];

    if (keyword && keyword.trim()) {
      params.push(`%${keyword.trim()}%`);
      conditions.push(`p.nama ILIKE $${params.length}`);
    }
    if (idToko) {
      params.push(parseId(idToko));
      conditions.push(`p."userId" = $${params.length}`);
    }
    if (kategori) {
      params.push(parseId(kategori));
      conditions.push(`p.kategori = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await db.query(`SELECT COUNT(*)::int AS total FROM "Product" p ${where}`, params);
    const totalData = countResult.rows[0].total;

    if (offset >= totalData) {
      return res.status(200).send({ success: true, message: "Req berhasil", data: [], totalData });
    }

    let order = "p.id ASC";
    if (orderBy === "harga_desc") order = "p.harga DESC";
    else if (orderBy === "harga_asc") order = "p.harga ASC";

    params.push(limit, offset);
    const result = await db.query(`
      SELECT
        p.id, p.nama, p.path, p.harga, p.kategori,
        json_build_object(
          'nama_toko', u.nama_toko,
          'rating_toko', u.rating_toko
        ) AS user
      FROM "Product" p
      JOIN "Users" u ON u.id = p."userId"
      ${where}
      ORDER BY ${order}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.status(200).send({ success: true, message: "Req berhasil", data: result.rows, totalData });
  } catch (error) {
    console.error(error);
    res.status(400).send({ success: false, message: "terjadi kesalahan" });
  }
});

app.get("/api/v1/product/count", async (req, res) => {
  try {
    const params = [];
    let where = "";
    if (req.query.kategori) {
      params.push(parseId(req.query.kategori));
      where = `WHERE kategori = $1`;
    }
    const result = await db.query(`SELECT COUNT(*)::int AS total FROM "Product" ${where}`, params);
    res.status(200).send({ success: true, message: "Total produk berhasil diambil", total: result.rows[0].total });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Terjadi kesalahan saat mengambil total produk" });
  }
});

app.get("/api/v1/product/search", async (req, res) => {
  try {
    const keyword = req.query.keyword ? req.query.keyword.trim() : "";
    const result = await db.query(`
      SELECT
        p.id, p.nama, p.path,
        json_build_object(
          'nama_toko', u.nama_toko,
          'rating_toko', u.rating_toko
        ) AS user
      FROM "Product" p
      JOIN "Users" u ON u.id = p."userId"
      WHERE p.nama ILIKE $1
      ORDER BY p.id DESC
    `, [`%${keyword}%`]);

    if (result.rows.length > 0) {
      return res.status(200).send({ success: true, message: "Req berhasil", data: result.rows });
    }
    return res.status(200).send({ success: false, message: "Produk tidak ditemukan", data: [] });
  } catch (error) {
    console.error(error);
    res.status(400).send({ error, success: false, message: "terjadi kesalahan" });
  }
});

app.get("/api/v1/product/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const result = await db.query(`
      SELECT
        p.id, p.nama, p.path, p.harga, p.desc, p.kategori,
        json_build_object(
          'nama_toko', u.nama_toko,
          'rating_toko', u.rating_toko,
          'telp', u.telp,
          'id', u.id,
          'path_file', u.path_file
        ) AS user
      FROM "Product" p
      JOIN "Users" u ON u.id = p."userId"
      WHERE p.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).send({ success: false, message: "Product tidak ditemukan" });
    }
    res.status(200).send({ success: true, message: "Req berhasil", data: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(400).send({ success: false, message: "terjadi kesalahan" });
  }
});

// ==================== TOKO ====================
app.get("/api/v1/toko", async (req, res) => {
  try {
    const { total, page, orderBy, keyword, klasifikasi } = req.query;
    const limit = Number.parseInt(total, 10) || 10;
    const pageNumber = Number.parseInt(page, 10) || 1;
    const offset = (pageNumber - 1) * limit;
    const params = [1];
    const conditions = [`u.buka_toko = $1`];

    if (keyword && keyword.trim()) {
      params.push(`%${keyword.trim()}%`);
      conditions.push(`u.nama_toko ILIKE $${params.length}`);
    }
    // Schema yang diberikan menyimpan klasifikasi_toko sebagai INTEGER.
    if (klasifikasi) {
      params.push(parseId(klasifikasi));
      conditions.push(`u.klasifikasi_toko = $${params.length}`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const countResult = await db.query(`SELECT COUNT(*)::int AS total FROM "Users" u ${where}`, params);
    const totalData = countResult.rows[0].total;

    if (offset >= totalData) {
      return res.status(200).send({ success: true, message: "Req berhasil", data: [] });
    }

    let order = "u.id ASC";
    if (orderBy === "rating_desc") order = "u.rating_toko DESC";
    else if (orderBy === "rating_asc") order = "u.rating_toko ASC";

    params.push(limit, offset);
    const result = await db.query(`
      SELECT
        u.id, u.nama_toko, u.rating_toko, u.klasifikasi_toko, u.buka_toko,
        COALESCE((
          SELECT json_agg(json_build_object(
            'provinsi', p.nama,
            'kabupaten', k.nama,
            'kecamatan', kc.nama,
            'desa', d.nama,
            'kode_pos', a."kodePos",
            'detail', a.detail
          ) ORDER BY a.id)
          FROM "Alamat" a
          LEFT JOIN "Provinsi" p ON a."kodeProv" = p.kode
          LEFT JOIN "Kabupaten" k ON a."kodeProv" = k."kodeProv" AND a."kodeKab" = k.kode
          LEFT JOIN "Kecamatan" kc ON a."kodeProv" = kc."kodeProv" AND a."kodeKab" = kc."kodeKab" AND a."kodeKec" = kc.kode
          LEFT JOIN "Desa" d ON a."kodeProv" = d."kodeProv" AND a."kodeKab" = d."kodeKab" AND a."kodeKec" = d."kodeKec" AND a."kodeDesa" = d.kode
          WHERE a."userId" = u.id AND a.is_toko = 1
        ), '[]'::json) AS alamat
      FROM "Users" u
      ${where}
      ORDER BY ${order}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.status(200).send({ success: true, message: "Req berhasil", data: result.rows, totalData });
  } catch (error) {
    console.error(error);
    res.status(400).send({ success: false, message: "terjadi kesalahan" });
  }
});

app.get("/api/v1/toko/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const result = await db.query(`
      SELECT
        u.nama_toko, u.klasifikasi_toko, u.rating_toko, u.telp,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', a.id,
            'kabupaten', k.nama
          ) ORDER BY a.id)
          FROM "Alamat" a
          LEFT JOIN "Kabupaten" k
            ON a."kodeProv" = k."kodeProv" AND a."kodeKab" = k.kode
          WHERE a."userId" = u.id AND a.is_toko = 1 AND a.is_default = 1
        ), '[]'::json) AS alamat
      FROM "Users" u
      WHERE u.id = $1
    `, [id]);

    res.status(200).send({ success: true, message: "Req berhasil", data: result.rows[0] || null });
  } catch (error) {
    console.error(error);
    res.status(400).send({ success: false, message: "terjadi kesalahan" });
  }
});

app.get("/api/v1/top_toko", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        u.id, u.nama_toko, u.rating_toko, u.klasifikasi_toko, u.path_file,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', a.id,
            'kabupaten', k.nama
          ) ORDER BY a.id)
          FROM "Alamat" a
          LEFT JOIN "Kabupaten" k
            ON a."kodeProv" = k."kodeProv" AND a."kodeKab" = k.kode
          WHERE a."userId" = u.id AND a.is_toko = 1
        ), '[]'::json) AS alamat
      FROM "Users" u
      WHERE u.buka_toko = 1
      ORDER BY u.rating_toko ASC
      LIMIT 2
    `);
    res.status(200).send({ success: true, message: "Req Berhasil", data: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Terjadi Kesalahan", error });
  }
});

// ==================== ALAMAT ====================
app.post("/api/v1/alamat", async (req, res) => {
  const {
    userId, kodeProv, kodeKab, kodeKec, kodeDesa, detail,
    kode_pos, is_toko, is_default, bangunan, nama, notelp,
  } = req.body;

  try {
    const result = await db.query(`
      INSERT INTO "Alamat" (
        "userId", "kodeProv", "kodeKab", "kodeKec", "kodeDesa",
        detail, "kodePos", is_toko, is_default, bangunan, nama, notelp
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [
      userId, kodeProv, kodeKab, kodeKec, kodeDesa,
      detail || "", kode_pos || "", is_toko || 0, is_default || 0,
      bangunan || "", nama || "", notelp || "",
    ]);

    res.status(200).json({ success: true, message: "Alamat berhasil ditambahkan", data: result.rows[0] });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ success: false, message: "Terjadi Kesalahan", data: error.message });
  }
});

app.post("/api/v1/alamat/toko", async (req, res) => {
  const userId = parseId(req.body.userId);
  const alamatId = parseId(req.body.alamatId);

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE "Alamat" SET is_toko = 0 WHERE "userId" = $1`, [userId]);
    const result = await client.query(`
      UPDATE "Alamat" SET is_toko = 1 WHERE id = $1 AND "userId" = $2 RETURNING *
    `, [alamatId, userId]);
    await client.query("COMMIT");

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Alamat tidak ditemukan" });
    }
    res.status(200).json({ success: true, message: "Alamat toko berhasil diupdate", data: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ success: false, message: "Terjadi Kesalahan", data: error.message });
  } finally {
    client.release();
  }
});

app.post("/api/v1/alamat/default", async (req, res) => {
  const userId = parseId(req.body.userId);
  const alamatId = parseId(req.body.alamatId);

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE "Alamat" SET is_default = 0 WHERE "userId" = $1`, [userId]);
    const result = await client.query(`
      UPDATE "Alamat" SET is_default = 1 WHERE id = $1 AND "userId" = $2 RETURNING *
    `, [alamatId, userId]);
    await client.query("COMMIT");

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Alamat tidak ditemukan" });
    }
    res.status(200).json({ success: true, message: "Alamat default berhasil diupdate", data: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ success: false, message: "Terjadi Kesalahan", data: error.message });
  } finally {
    client.release();
  }
});

// ==================== AUTH ====================
app.post("/api/v1/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await db.query(`
      SELECT id, email, password, "firstName", "lastName", role, telp,
             buka_toko, nama_toko, klasifikasi_toko, rating_toko, gender,
             tanggal_lahir, path_file
      FROM "Users"
      WHERE email = $1
    `, [email]);

    const uniqueUser = result.rows[0];
    if (!uniqueUser) return res.status(200).send({ message: "error email" });

    const isValidPassword = await bcrypt.compare(password, uniqueUser.password);
    if (!isValidPassword) {
      return res.status(200).json({ success: false, message: "Salah Password" });
    }

    const info = {
      id: uniqueUser.id,
      firstName: uniqueUser.firstName,
      lastName: uniqueUser.lastName,
      email: uniqueUser.email,
      role: uniqueUser.role,
      telp: uniqueUser.telp,
      nama_toko: uniqueUser.nama_toko,
      buka_toko: uniqueUser.buka_toko,
      klasifikasi_toko: uniqueUser.klasifikasi_toko,
      rating_toko: uniqueUser.rating_toko,
    };
    const token = jwt.sign(info, secretKey);

    res.status(200).send({
      success: true,
      message: "Login Success",
      id_user: uniqueUser.id,
      token,
      role: uniqueUser.role,
      firstname: uniqueUser.firstName,
      lastname: uniqueUser.lastName,
      email: uniqueUser.email,
      gender: uniqueUser.gender,
      tanggal_lahir: uniqueUser.tanggal_lahir,
      telp: uniqueUser.telp,
      nama_toko: uniqueUser.nama_toko,
      buka_toko: uniqueUser.buka_toko,
      klasifikasi_toko: uniqueUser.klasifikasi_toko,
      rating_toko: uniqueUser.rating_toko,
      path_file: uniqueUser.path_file,
    });
  } catch (error) {
    console.error(error);
    res.status(200).json({ success: false, message: "Terjadi Kesalahan", error: error.message });
  }
});

app.post("/api/v1/register", async (req, res) => {
  try {
    const { firstName, lastName, password, email } = req.body;
    if (!firstName || !lastName || !password || !email) {
      return res.status(400).json({ success: false, message: "Data tidak lengkap" });
    }

    const existing = await db.query(`SELECT id FROM "Users" WHERE email = $1`, [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: "Email sudah digunakan" });
    }

    const hashedPass = await bcrypt.hash(password, 10);
    await db.query(`
      INSERT INTO "Users" ("firstName", "lastName", email, role, password)
      VALUES ($1, $2, $3, 1, $4)
    `, [firstName, lastName, email, hashedPass]);

    res.status(201).json({ success: true, message: "User berhasil didaftarkan" });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ success: false, message: "Terjadi Kesalahan", data: error.message });
  }
});

// ==================== PRODUCT CREATE ====================
app.post("/api/v1/product", authenticateToko, uploadProduk.any(), async (req, res) => {
  try {
    const { nama, deskripsi, kategori, harga } = req.body;
    const userId = req.user.id;
    const files = (req.files || []).slice().reverse();

    const productResult = await db.query(`
      INSERT INTO "Product" ("userId", nama, "desc", path, kategori, harga)
      VALUES ($1, $2, $3, '', $4, $5)
      RETURNING *
    `, [userId, nama, deskripsi, parseId(kategori), parseInt(harga, 10) || 0]);

    const product = productResult.rows[0];
    const idProduk = product.id;
    const folderFinal = path.join(__dirname, "img", "product", String(idProduk));
    fs.mkdirSync(folderFinal, { recursive: true });

    const fileUtamaPath = [];
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const ext = path.extname(file.originalname).toLowerCase();
      const finalFileName = `${index}${ext}`;
      const finalPath = path.join(folderFinal, finalFileName);
      fs.renameSync(file.path, finalPath);
      fileUtamaPath.push(`/img/product/${idProduk}/${finalFileName}`);
    }

    const updated = await db.query(`
      UPDATE "Product" SET path = $1 WHERE id = $2 RETURNING *
    `, [JSON.stringify(fileUtamaPath), idProduk]);

    res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    console.error("Gagal:", err);
    res.status(500).json({ success: false, message: "Gagal menambahkan produk", error: err.message });
  }
});

// ==================== DELETE ====================
app.delete("/api/v1/product/:id", authenticateToko, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const result = await db.query(`SELECT path FROM "Product" WHERE id = $1`, [id]);
    const existingProduct = result.rows[0];

    if (!existingProduct) {
      return res.status(404).json({ success: false, message: "Produk tidak ditemukan" });
    }

    await db.query(`DELETE FROM "Product" WHERE id = $1`, [id]);
    const filePaths = JSON.parse(existingProduct.path || "[]");
    filePaths.forEach((fileRelPath) => {
      const cleanPath = fileRelPath.replace(/^\//, "");
      const fullPath = path.join(__dirname, cleanPath);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    });

    const folderPath = path.join(__dirname, "img", "product", String(id));
    if (fs.existsSync(folderPath)) fs.rmSync(folderPath, { recursive: true, force: true });

    res.status(200).json({ success: true, message: "Produk berhasil dihapus" });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ success: false, message: "Terjadi Kesalahan", data: error.message });
  }
});

app.delete("/api/v1/alamat/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const result = await db.query(`SELECT id FROM "Alamat" WHERE id = $1`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Alamat tidak ditemukan" });
    }

    await db.query(`DELETE FROM "Alamat" WHERE id = $1`, [id]);
    res.status(200).json({ success: true, message: "Alamat berhasil dihapus" });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ success: false, message: "Terjadi Kesalahan", data: error.message });
  }
});

// Tidak dikonversi karena tabel Review tidak ada pada schema yang diberikan.
app.delete("/api/v1/review/:id", async (req, res) => {
  return res.status(501).json({
    success: false,
    message: "Endpoint review belum tersedia karena tabel Review tidak ada pada schema database yang diberikan",
  });
});

// ==================== PRODUCT UPDATE ====================
app.patch("/api/v1/product/:id", authenticateToko, uploadProduk.any(), async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { nama, deskripsi, userId, kategori, harga = 0 } = req.body;

    const result = await db.query(`SELECT * FROM "Product" WHERE id = $1`, [id]);
    const existingProduct = result.rows[0];
    if (!existingProduct) {
      return res.status(404).json({ success: false, message: "Produk tidak ditemukan" });
    }

    const fileUtamaBaru = (req.files || []).filter((f) => f.fieldname === "files");
    const updateValues = [
      nama,
      deskripsi,
      parseId(userId),
      parseId(kategori),
      parseInt(harga, 10) || 0,
    ];
    let sql = `
      UPDATE "Product"
      SET nama = $1, "desc" = $2, "userId" = $3, kategori = $4, harga = $5
    `;

    if (fileUtamaBaru.length > 0) {
      try {
        const pathLama = JSON.parse(existingProduct.path || "[]");
        pathLama.forEach((p) => {
          const fullPath = path.join(__dirname, p.replace(/^\//, ""));
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        });
      } catch (e) {
        console.error("Gagal parsing atau hapus path lama:", e);
      }

      const folderFinal = path.join(__dirname, "img", "product", String(id));
      fs.mkdirSync(folderFinal, { recursive: true });
      const fileUtamaPath = [];
      let fileIndex = 0;

      for (const file of fileUtamaBaru) {
        const ext = path.extname(file.originalname).toLowerCase();
        const finalFileName = `${fileIndex}${ext}`;
        const finalPath = path.join(folderFinal, finalFileName);
        fs.renameSync(file.path, finalPath);
        fileUtamaPath.push(`/img/product/${id}/${finalFileName}`);
        fileIndex++;
      }

      updateValues.push(JSON.stringify(fileUtamaPath));
      sql += `, path = $6`;
    }

    sql += ` WHERE id = $${updateValues.length + 1} RETURNING *`;
    updateValues.push(id);

    const updated = await db.query(sql, updateValues);
    res.json({ success: true, message: "Produk berhasil diperbarui", data: updated.rows[0] });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan saat update produk", error: error.message });
  }
});

// ==================== USER UPDATE ====================
app.patch("/api/v1/users/:id", authenticateToko, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { firstName, lastName, telepon, nama_toko, jenisKelamin } = req.body;

    const existing = await db.query(`SELECT id FROM "Users" WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    }

    const result = await db.query(`
      UPDATE "Users"
      SET "firstName" = $1,
          "lastName" = $2,
          telp = $3,
          nama_toko = $4,
          gender = $5
      WHERE id = $6
      RETURNING *
    `, [firstName, lastName, telepon, nama_toko, parseId(jenisKelamin), id]);

    res.status(200).json({ success: true, message: "User berhasil diupdate", data: result.rows[0] });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ success: false, message: "Terjadi Kesalahan", data: error.message });
  }
});

app.patch("/api/v1/users/profile-image/:id", uploadProfileImage.single("image"), async (req, res) => {
  const id = parseId(req.params.id);
  const file = req.file;
  if (!file) return res.status(400).json({ success: false, message: "Gambar tidak ditemukan" });

  try {
    const result = await db.query(`SELECT path_file FROM "Users" WHERE id = $1`, [id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ success: false, message: "User tidak ditemukan" });

    if (user.path_file) {
      const oldImagePath = path.join(__dirname, "img", "profile_image", user.path_file);
      if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
    }

    const updated = await db.query(`
      UPDATE "Users" SET path_file = $1 WHERE id = $2 RETURNING *
    `, [file.filename, id]);

    res.status(200).json({ success: true, message: "Foto profil berhasil diupdate", data: updated.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan saat update gambar" });
  }
});

app.patch("/api/v1/users/password/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { password, passwordLama } = req.body;

    const result = await db.query(`SELECT password FROM "Users" WHERE id = $1`, [id]);
    const existingUser = result.rows[0];
    if (!existingUser) {
      return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    }

    const isMatch = await bcrypt.compare(passwordLama, existingUser.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Password lama tidak sesuai" });
    }

    const hashedPass = await bcrypt.hash(password, 10);
    const updated = await db.query(`
      UPDATE "Users" SET password = $1 WHERE id = $2 RETURNING id, email
    `, [hashedPass, id]);

    res.status(200).json({ success: true, message: "Password berhasil diupdate", data: updated.rows[0] });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ success: false, message: "Terjadi Kesalahan", data: error.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: err.message });
  }
  res.status(500).json({ success: false, message: err.message || "Internal Server Error" });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
