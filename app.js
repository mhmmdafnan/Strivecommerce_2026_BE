const dotenv = require("dotenv");
const express = require("express");
const app = express();
dotenv.config();
// var db = require('./dbconn');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs");
// const upload = multer({ dest: 'uploads/' });
const authUser = require("./AuthUser");

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const port = 3001;

// agar API bisa dia kses
// const cors = require("cors");
const cors = require("cors");
app.use(
  cors({
    origin: "http://localhost:5173", // hanya FE kamu yang boleh akses
  }),
);

const path = require("path");
const { log } = require("console");

const secretKey = "hkalshd9832yhui234hg234gjksdfsdnbnsvoisdsii";

// Setup penyimpanan file ke folder 'uploads/'
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/ktp/");
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const fileName = `ktp_${Date.now()}${ext}`;
    cb(null, fileName);
  },
});

// Storage config
const storageProduk = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "img/product/");
  },
  filename: function (req, file, cb) {
    // Ambil nama produk dari form body
    let namaProduk = req.body.nama || "produk";

    // Hilangkan spasi, huruf kecil semua, buang karakter aneh
    namaProduk = namaProduk
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");

    // Ambil ekstensi asli
    const ext = path.extname(file.originalname);

    // Buat nama file akhir
    const fileName = `${namaProduk}_${Date.now()}${ext}`;

    cb(null, fileName);
  },
});

const uploadProduk = multer({ storage: storageProduk });

const storageProfileImage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "img/profile_image/"); // Pastikan folder ini sudah ada
  },
  filename: function (req, file, cb) {
    try {
      // Ambil nama pengguna dari body (atau gunakan 'user' sebagai fallback)
      let namaUser = req.body.nama || "user";

      // Bersihkan nama (biar tidak aneh-aneh)
      namaUser = namaUser
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");

      // Ambil ekstensi file
      const ext = path.extname(file.originalname).toLowerCase();

      // Gabungkan nama file
      const fileName = `profile_${namaUser}_${Date.now()}${ext}`;

      cb(null, fileName);
    } catch (err) {
      cb(err);
    }
  },
});

const fileFilterProfileImage = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  if (allowedTypes.test(ext) && allowedTypes.test(mime)) {
    cb(null, true);
  } else {
    cb(new Error("File harus berupa gambar (jpg, jpeg, png, webp)"));
  }
};

const uploadProfileImage = multer({
  storage: storageProfileImage,
  fileFilter: fileFilterProfileImage,
  limits: { fileSize: 2 * 1024 * 1024 }, // maksimal 2MB
});

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use("/img", express.static(path.join(__dirname, "img")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Middleware untuk auth

function authenticateToko(req, res, next) {
  const token = req.headers["token"];
  if (token == null)
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    }); // Unauthorized

  jwt.verify(token, secretKey, (err, user) => {
    if (err)
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      }); // Forbidden
    req.user = user;
    if (user.buka_toko == 1) {
      next();
    } else {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      }); // Forbidden
    }
  });
}
function authenticateAdmin(req, res, next) {
  const token = req.headers["token"];
  if (token == null)
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    }); // Unauthorized

  jwt.verify(token, secretKey, (err, user) => {
    if (err)
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      }); // Forbidden
    req.user = user;
    if (user.role === 10) {
      next();
    } else {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      }); // Forbidden
    }
  });
}

function authenticateUser(req, res, next) {
  const token = req.headers["token"];
  if (token == null)
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    }); // Unauthorized

  jwt.verify(token, secretKey, (err, user) => {
    if (err)
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      }); // Forbidden
    req.user = user;
    next();
  });
}

// GET API

//
app.get("/", (req, res) => {
  res.send("API Connected");
});

// API untuk mendapatkan file gambar
app.get("/pict/:id_product/:filename", (req, res) => {
  const { id_product, filename } = req.params;

  // Tentukan path file gambar berdasarkan ID product dan nama file
  const filePath = path.join(__dirname, "img", "product", id_product, filename);

  // Cek apakah file ada
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error(err);
      res.status(404).json({
        success: false,
        message: "File tidak ditemukan",
      });
    }
  });
});

app.get("/api/v1/users/:id", async (req, res) => {
  const { id } = req.params;

  const user = await prisma.users.findUnique({
    where: { id: parseInt(id) },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      telp: true,
      nama_toko: true,
      klasifikasi_toko: true,
      rating_toko: true,
      buka_toko: true,
      alamat: {
        select: {
          id: true,
          provinsi: true,
          kabupaten: true,
          kecamatan: true,
          desa: true,
          kode_pos: true,
          detail: true,
          catatan: true,
        },
      },
    },
  });

  if (!user) {
    return res.status(404).send({
      success: false,
      message: "User tidak ditemukan",
    });
  }

  res.json(user);
});

app.get("/api/v1/prov", async (req, res) => {
  const prov = await prisma.provinsi.findMany({
    select: {
      kode: true,
      nama: true,
    },
  });

  return res.status(200).send({
    success: true,
    data: prov,
  });
});

app.get("/api/v1/kab/:kode_prov", async (req, res) => {
  const { kode_prov } = req.params;

  const kab = await prisma.kabupaten.findMany({
    select: {
      kode: true,
      nama: true,
    },
    where: {
      kodeProv: kode_prov,
    },
  });

  return res.status(200).send({
    success: true,
    data: kab,
  });
});

app.get("/api/v1/kec/:kode_prov/:kode_kab", async (req, res) => {
  const { kode_prov, kode_kab } = req.params;
  console.log(req.params);

  const kec = await prisma.kecamatan.findMany({
    select: {
      kode: true,
      nama: true,
    },
    where: {
      kodeProv: kode_prov,
      kodeKab: kode_kab,
    },
  });

  return res.status(200).send({
    success: true,
    data: kec,
  });
});

app.get("/api/v1/desa/:kode_prov/:kode_kab/:kode_kec", async (req, res) => {
  const { kode_prov, kode_kab, kode_kec } = req.params;
  console.log(req.params);

  const desa = await prisma.desa.findMany({
    select: {
      kode: true,
      nama: true,
    },
    where: {
      kodeProv: kode_prov,
      kodeKab: kode_kab,
      kodeKec: kode_kec,
    },
  });

  return res.status(200).send({
    success: true,
    data: desa,
  });
});

app.get("/api/v1/alamat/:id_user", async (req, res) => {
  const { id_user } = req.params;

  console.log(id_user);

  const alamat = await prisma.alamat.findMany({
    where: {
      userId: parseInt(id_user),
    },
    select: {
      id: true,
      id: true,
      detail: true,
      is_default: true,
      nama: true,
      bangunan: true,
      notelp: true,
      is_toko: true,
      provinsi: {
        select: { nama: true },
      },
      kabupaten: {
        select: { nama: true },
      },
      kecamatan: {
        select: { nama: true },
      },
      desa: {
        select: { nama: true },
        select: { nama: true },
      },
      kodePos: true,
    },
  });

  return res.status(200).send({
    success: true,
    data: alamat,
  });
});

app.get("/api/v1/users", async (req, res) => {
  const users = await prisma.users.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      telp: true,
      nama_toko: true,
      klasifikasi_toko: true,
      rating_toko: true,
      buka_toko: true,
    },
  });
  res.json(users);
});

app.get("/api/v1/product", async (req, res) => {
  try {
    const { total, page, orderBy, keyword, idToko, kategori } = req.query;

    const keywordTrimmed = keyword ? keyword.trim() : undefined;
    console.log("Halo");
    let order = {};
    if (orderBy === "harga_desc") {
      order = { harga: "desc" };
    } else if (orderBy === "harga_asc") {
      order = { harga: "asc" };
    }

    let totalQ = parseInt(total) || 10;
    let pageQ = parseInt(page) || 1;

    // Buat where clause dinamis
    const whereClause = {
      nama: keywordTrimmed
        ? {
            contains: keywordTrimmed,
            mode: "insensitive",
          }
        : undefined,
      userId: idToko ? parseInt(idToko) : undefined,
      kategori: kategori ? parseInt(kategori) : undefined, // ✅ filter kategori
    };

    // Hitung total hasil pencarian
    const totalData = await prisma.product.count({
      where: whereClause,
    });

    // Hitung skip
    const skip = (pageQ - 1) * totalQ;
    if (skip >= totalData) {
      return res.status(200).send({
        success: true,
        message: "Req berhasil",
        data: [],
        totalData,
      });
    }

    const result = await prisma.product.findMany({
      select: {
        id: true,
        nama: true,
        path: true,
        harga: true,
        kategori: true,
        user: {
          select: {
            nama_toko: true,
            rating_toko: true,
          },
        },
      },
      take: totalQ,
      skip: skip,
      where: whereClause,
      orderBy: order, // ✅ orderBy Prisma langsung dipakai
    });

    return res.status(200).send({
      success: true,
      message: "Req berhasil",
      data: result,
      totalData,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).send({
      success: false,
      message: "terjadi kesalahan",
    });
  }
});

app.get("/api/v1/product/count", async (req, res) => {
  try {
    const { kategori } = req.query;

    const whereClause = kategori
      ? { kategori: parseInt(kategori) } // filter berdasarkan kategori
      : {}; // kalau tidak ada kategori, hitung semua

    const totalData = await prisma.product.count({
      where: whereClause,
    });

    return res.status(200).send({
      success: true,
      message: "Total produk berhasil diambil",
      total: totalData,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).send({
      success: false,
      message: "Terjadi kesalahan saat mengambil total produk",
    });
  }
});

app.get("/api/v1/product/search", async (req, res) => {
  try {
    const { keyword } = req.query;

    const keywordTrimmed = keyword ? keyword.trim() : undefined;

    const products = await prisma.product.findMany({
      select: {
        id: true,
        nama: true,
        path: true,
        user: {
          select: {
            nama_toko: true,
            rating_toko: true,
          },
        },
      },
      where: {
        nama: keywordTrimmed
          ? {
              contains: keywordTrimmed,
              mode: "insensitive",
            }
          : undefined,
      },
    });

    if (products.length > 0) {
      return res.status(200).send({
        success: true,
        message: "Req berhasil",
        data: products,
      });
    } else {
      return res.status(200).send({
        success: false,
        message: "Produk tidak ditemukan",
        data: [],
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(400).send({
      error: error,
      success: false,
      message: "terjadi kesalahan",
    });
  }
});

//goks
app.get("/api/v1/product/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id: parseInt(id) },
      select: {
        user: {
          select: {
            nama_toko: true,
            rating_toko: true,
            telp: true,
            id: true,
            path_file: true,
          },
        },
        nama: true,
        path: true,
        harga: true,
        desc: true,
        kategori: true,
      },
    });

    if (!product) {
      return res.status(404).send({
        success: false,
        message: "Product tidak ditemukan",
      });
    }

    return res.status(200).send({
      success: true,
      message: "Req berhasil",
      data: product,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).send({
      success: false,
      message: "terjadi kesalahan",
    });
  }
});

app.get("/api/v1/toko", async (req, res) => {
  try {
    const { total, page, orderBy, keyword, klasifikasi } = req.query;

    const keywordTrimmed = keyword ? keyword.trim() : undefined;

    let order = {};
    if (orderBy == "rating_desc") {
      order = { rating_toko: "desc" };
    } else if (orderBy == "rating_asc") {
      order = { rating_toko: "asc" };
    }

    let totalQ = parseInt(total) || 10;
    let pageQ = parseInt(page) || 1;

    // Hitung total hasil pencarian
    const totalData = await prisma.users.count({
      where: {
        buka_toko: 1,
        nama_toko: keywordTrimmed
          ? {
              contains: keywordTrimmed,
              mode: "insensitive",
            }
          : undefined,
        klasifikasi_toko: klasifikasi
          ? {
              contains: klasifikasi,
              mode: "insensitive",
            }
          : undefined,
      },
    });

    // Hitung skip, jika skip melebihi total data, kembalikan data kosong
    const skip = (pageQ - 1) * totalQ;
    if (skip >= totalData) {
      return res.status(200).send({
        success: true,
        message: "Req berhasil",
        data: [],
      });
    }

    const result = await prisma.users.findMany({
      select: {
        id: true,
        nama_toko: true,
        rating_toko: true,
        klasifikasi_toko: true,
        buka_toko: true,
        alamat: {
          where: {
            is_toko: 1,
          },
          select: {
            provinsi: true,
            kabupaten: true,
            kecamatan: true,
            desa: true,
            kode_pos: true,
            detail: true,
          },
        },
      },
      where: {
        buka_toko: 1,
        nama_toko: keywordTrimmed
          ? {
              contains: keywordTrimmed,
              mode: "insensitive",
            }
          : undefined,
        klasifikasi_toko: klasifikasi
          ? {
              contains: klasifikasi,
              mode: "insensitive",
            }
          : undefined,
      },
      take: totalQ,
      skip: skip,
      orderBy: order,
    });

    return res.status(200).send({
      success: true,
      message: "Req berhasil",
      data: result,
      totalData,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).send({
      success: false,
      message: "terjadi kesalahan",
    });
  }
});

app.get("/api/v1/toko/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const toko = await prisma.users.findFirst({
      where: {
        id: parseInt(id),
      },
      select: {
        nama_toko: true,
        klasifikasi_toko: true,
        rating_toko: true,
        telp: true,
        path_file: true,
        // alamat: {
        //   where: {
        //     AND: [{ is_toko: 1 }, { is_default: 1 }],
        //   },
        //   select: {
        //     //default alamat
        //     id: true,
        //     kabupaten: {
        //       select: {
        //         nama: true,
        //       },
        //     },
        //   },
        // },
      },
    });
    // console.log(toko);

    return res.status(200).send({
      success: true,
      message: "Req berhasil",
      data: toko,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).send({
      success: false,
      message: "terjadi kesalahan",
    });
  }
});

app.get("/api/v1/top_toko", async (req, res) => {
  try {
    // const { userId } = req.query;

    // console.log(req.query);

    const topToko = await prisma.users.findMany({
      select: {
        id: true,
        nama_toko: true,
        rating_toko: true,
        klasifikasi_toko: true,
        path_file: true,
        alamat: {
          where: {
            is_toko: 1,
          },
          select: {
            id: true,
            kabupaten: {
              select: {
                nama: true,
              },
            },
          },
        },
      },
      where: {
        buka_toko: 1,
      },
      take: 2,
      orderBy: {
        rating_toko: "asc",
      },
    });
    // console.log(allUserCart);

    return res.status(200).send({
      success: true,
      message: "Req Berhasil",
      data: topToko,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi Kesalahan",
      error: error,
    });
  }
});

// POST API

// app.post("/api/v1/register", async (req, res) => {
//   const { firstName, lastName, email, pass } = req.body;
//   console.log(req.body);

//   if (!firstName || !lastName || !email || !pass) {
//     return res.status(400).json({
//       success: false,
//       message: "Data tidak lengkap",
//     });
//   }

//   const hashedPass = await bcrypt.hash(pass, 10);

//   const user = await prisma.users.create({
//     data: { firstName, lastName, email, password: hashedPass },
//   });

//   console.log("user created:", user);

//   res.status(200).json({
//     success: true,
//     user,
//   });
// });

app.post("/api/v1/alamat", async (req, res) => {
  const {
    userId,
    kodeProv,
    kodeKab,
    kodeKec,
    kodeDesa,
    detail,
    catatan,
    kode_pos,
    is_toko,
    is_default,
    bangunan,
    nama,
    notelp,
  } = req.body;

  console.log(req.body);

  try {
    const alamatBaru = await prisma.alamat.create({
      data: {
        userId,
        kodeProv,
        kodeKab,
        kodeKec,
        kodeDesa,
        detail,
        catatan,
        bangunan,
        nama,
        notelp: notelp,
        kodePos: kode_pos,
        is_toko,
        is_default,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Alamat berhasil ditambahkan",
      data: alamatBaru,
    });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi Kesalahan",
      data: error,
    });
  }
});

app.post("/api/v1/alamat/toko", async (req, res) => {
  const { userId, alamatId } = req.body;

  try {
    // Hapus status toko dari semua alamat user
    await prisma.alamat.updateMany({
      where: { userId: parseInt(userId) },
      data: { is_toko: 0 },
    });

    // Set alamat yang dipilih sebagai toko
    const updatedAlamat = await prisma.alamat.update({
      where: { id: parseInt(alamatId) },
      data: { is_toko: 1 },
    });

    return res.status(200).json({
      success: true,
      message: "Alamat toko berhasil diupdate",
      data: updatedAlamat,
    });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi Kesalahan",
      data: error,
    });
  }
});

app.post("/api/v1/alamat/default", async (req, res) => {
  const { userId, alamatId } = req.body;

  try {
    // Hapus status default dari semua alamat user
    await prisma.alamat.updateMany({
      where: { userId: parseInt(userId) },
      data: { is_default: 0 },
    });

    // Set alamat yang dipilih sebagai default
    const updatedAlamat = await prisma.alamat.update({
      where: { id: parseInt(alamatId) },
      data: { is_default: 1 },
    });

    return res.status(200).json({
      success: true,
      message: "Alamat default berhasil diupdate",
      data: updatedAlamat,
    });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi Kesalahan",
      data: error,
    });
  }
});

app.post("/api/v1/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(req.body);
    // console.log("valid");

    // const hashedPass = await bcrypt.hash(password, 10);
    const uniqueUser = await prisma.users.findFirst({
      select: {
        id: true,
        email: true,
        password: true,
        firstName: true,
        lastName: true,
        role: true,
        telp: true,
        buka_toko: true,
        nama_toko: true,
        klasifikasi_toko: true,
        rating_toko: true,
        gender: true,
        tanggal_lahir: true,
        path_file: true,
      },
      where: {
        email: email,
      },
    });

    if (!uniqueUser) {
      // Kalo misalnya email gaada
      return res.status(200).send({
        message: "error email",
      });
    } else {
      const isValidPassword = await bcrypt.compare(
        password,
        uniqueUser.password,
      );

      if (isValidPassword) {
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

        // TOKEN
        const token = jwt.sign(info, secretKey);

        // console.log(token);

        return res.status(200).send({
          success: true,
          message: "Login Success",
          id_user: uniqueUser.id,
          token: token,
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

        // setTimeout(() => {
        //     res.status(200).json({
        //         success: true,
        //         message: "Login Success",
        //         token: token,
        //     });
        // }, 5000);
      } else {
        return res.status(200).json({
          success: false,
          message: "Salah Password",
          ß,
        });
      }
    }
  } catch (error) {
    return res.status(200).json({
      success: false,
      message: "Terjadi Kesalahan",
      error: error,
    });
  }
});

app.post("/api/v1/register", async (req, res) => {
  try {
    const { firstName, lastName, password, email } = req.body;
    // console.log(req.body);

    if (!firstName || !lastName || !password || !email) {
      return res.status(400).json({
        success: false,
        message: "Data tidak lengkap",
      });
    }

    // Cek email dulu
    const existingUser = await prisma.users.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email sudah digunakan",
      });
    }

    const hashedPass = await bcrypt.hash(password, 10);

    const newUser = await prisma.users.create({
      data: {
        firstName: firstName,
        lastName: lastName,
        email: email,
        role: 1,
        password: hashedPass,
      },
    });

    return res.status(201).json({
      success: true,
      message: "User berhasil didaftarkan",
    });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi Kesalahan",
      data: error,
    });
  }
});

app.post(
  "/api/v1/product",
  authenticateToko,
  uploadProduk.any(),
  async (req, res) => {
    try {
      console.log("Tambah produk");

      const { nama, deskripsi, kategori, harga } = req.body;
      const userId = req.user.id;
      // console.log("BODY:", req.body);
      // console.log("FILES:", req.files);
      const reversedProduct = req.files.slice().reverse();
      // Simpan produk dulu dengan path kosong
      const product = await prisma.product.create({
        data: {
          nama,
          desc: deskripsi,
          kategori: parseInt(kategori),
          harga: parseInt(harga),
          path: "",
          user: {
            connect: { id: parseInt(userId) },
          },
        },
      });

      const idProduk = product.id;
      // console.log(idProduk);

      const folderFinal = `img/product/${idProduk}`;
      if (!fs.existsSync(folderFinal)) {
        fs.mkdirSync(folderFinal, { recursive: true });
      }

      let fileUtamaPath = [];
      if (reversedProduct) {
        for (let index = 0; index < reversedProduct.length; index++) {
          const file = reversedProduct[index];
          const ext = path.extname(file.originalname).toLowerCase();
          // Filter ekstensi
          const finalFileName = `${index}${ext}`;
          const finalPath = `${folderFinal}/${finalFileName}`;
          fs.renameSync(file.path, finalPath);
          fileUtamaPath.push(`/${finalPath}`);
        }
      }

      // Update path gambar utama
      const updatedProduct = await prisma.product.update({
        where: { id: idProduk },
        data: {
          path: JSON.stringify(fileUtamaPath), // array disimpan sebagai string JSON
        },
      });

      res.json({ success: true, data: updatedProduct });
    } catch (err) {
      console.error("Gagal:", err);
      res.status(500).json({
        success: false,
        message: "Gagal menambahkan produk",
        error: err.message,
      });
    }
  },
);

// DELETE API

app.delete("/api/v1/product/:id", authenticateToko, async (req, res) => {
  try {
    const { id } = req.params;

    // Cek apakah produk ada
    const existingProduct = await prisma.product.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: "Produk tidak ditemukan",
      });
    }

    // Hapus produk di DB
    await prisma.product.delete({
      where: { id: parseInt(id) },
    });

    const filePaths = JSON.parse(existingProduct.path || "[]");
    // Hapus semua file di BE
    filePaths.forEach((fileRelPath) => {
      const fullPath = path.join(__dirname, fileRelPath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    });
    // Hapus folder dan semua isinya
    const folderPath = path.join(__dirname, `img/product/${id}`);
    if (fs.existsSync(folderPath)) {
      fs.rmSync(folderPath, { recursive: true, force: true }); // Gunakan fs.rmSync, bukan fs.rmdirSync
    }

    return res.status(200).json({
      success: true,
      message: "Produk berhasil dihapus",
    });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi Kesalahan",
      data: error,
    });
  }
});

app.delete("/api/v1/alamat/:id", async (req, res) => {
  try {
    const { id } = req.params;

    console.log("Alamat dihapus : ", id);

    // Cek apakah review ada
    const existingReview = await prisma.alamat.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingReview) {
      return res.status(404).json({
        success: false,
        message: "Review tidak ditemukan",
      });
    }

    // Hapus review
    await prisma.alamat.delete({
      where: { id: parseInt(id) },
    });

    return res.status(200).json({
      success: true,
      message: "Alamat berhasil dihapus",
    });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi Kesalahan",
      data: error,
    });
  }
});

app.delete("/api/v1/review/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Cek apakah review ada
    const existingReview = await prisma.review.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingReview) {
      return res.status(404).json({
        success: false,
        message: "Review tidak ditemukan",
      });
    }

    // Hapus review
    await prisma.review.delete({
      where: { id: parseInt(id) },
    });

    return res.status(200).json({
      success: true,
      message: "Review berhasil dihapus",
    });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi Kesalahan",
      data: error,
    });
  }
});

// PATCH API

app.patch(
  "/api/v1/product/:id",
  authenticateToko,
  uploadProduk.any(),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { nama, deskripsi, userId, kategori, harga = 0 } = req.body;

      console.log("Update produk dengan ID:", id);
      if (!req.files || req.files.length === 0) {
        console.log("Tidak ada file yang diupload");
      }

      const existingProduct = await prisma.product.findUnique({
        where: { id: parseInt(id) },
      });

      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          message: "Produk tidak ditemukan",
        });
      }

      // Handle file gambar utama
      let fileUtamaPath = [];

      const fileUtamaBaru =
        req.files?.filter((f) => f.fieldname === "files") || [];

      if (fileUtamaBaru.length > 0) {
        try {
          // Hapus file lama
          const pathLama = JSON.parse(existingProduct.path || "[]");
          pathLama.forEach((p) => {
            const fullPath = path.join(__dirname, p);
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
            }
          });
        } catch (e) {
          console.error("Gagal parsing atau hapus path lama:", e);
        }
      }

      const folderFinal = `img/product/${id}`;
      if (!fs.existsSync(folderFinal)) {
        fs.mkdirSync(folderFinal, { recursive: true });
      }

      let fileIndex = 0;
      for (const file of fileUtamaBaru) {
        const ext = path.extname(file.originalname).toLowerCase();
        const finalFileName = `${fileIndex}${ext}`;
        const finalPath = `${folderFinal}/${finalFileName}`;

        fs.renameSync(file.path, finalPath);
        fileUtamaPath.push(`/${finalPath}`);
        fileIndex++;
      }

      const updateData = {
        nama,
        desc: deskripsi,
        userId: parseInt(userId),
        kategori: parseInt(kategori),
        harga: parseInt(harga),
      };

      // Hanya tambahkan path jika ada file baru
      if (fileUtamaPath.length > 0) {
        updateData.path = JSON.stringify(fileUtamaPath);
      }

      const updatedProduct = await prisma.product.update({
        where: { id: parseInt(id) },
        data: updateData,
      });

      res.json({
        success: true,
        message: "Produk berhasil diperbarui",
        data: updatedProduct,
      });
    } catch (error) {
      console.error("Server error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat update produk",
        error: error.message,
      });
    }
  },
);

app.patch("/api/v1/users/:id", authenticateToko, async (req, res) => {
  try {
    console.log(req.body);

    const { id } = req.params;
    const { firstName, lastName, telepon, nama_toko, jenisKelamin } = req.body;

    // Cek apakah user ada
    const existingUser = await prisma.users.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    // Update user
    const updatedUser = await prisma.users.update({
      where: { id: parseInt(id) },
      data: {
        firstName,
        lastName,
        telp: telepon,
        nama_toko,
        gender: parseInt(jenisKelamin),
      },
    });

    return res.status(200).json({
      success: true,
      message: "User berhasil diupdate",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi Kesalahan",
      data: error,
    });
  }
});

app.patch(
  "/api/v1/users/profile-image/:id",
  uploadProfileImage.single("image"),
  async (req, res) => {
    const { id } = req.params;
    const file = req.file;

    if (!file) {
      return res
        .status(400)
        .json({ success: false, message: "Gambar tidak ditemukan" });
    }

    try {
      // Ambil data user lama
      const user = await prisma.users.findUnique({
        where: { id: parseInt(id) },
      });

      // Jika user punya foto lama, hapus dari server
      if (user?.path_file) {
        const oldImagePath = path.join(
          __dirname,
          "img/profile_image", // folder tempat gambar disimpan
          user.path_file,
        );

        // Cek apakah file ada dulu sebelum dihapus
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath); // hapus file lama
        }
      }

      // Update data user dengan file baru
      const updatedUser = await prisma.users.update({
        where: { id: parseInt(id) },
        data: {
          path_file: file.filename,
        },
      });

      res.status(200).json({
        success: true,
        message: "Foto profil berhasil diupdate",
        data: updatedUser,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat update gambar",
      });
    }
  },
);

app.patch("/api/v1/users/password/:id", async (req, res) => {
  try {
    // console.log(req.body);
    // console.log(parseInt(req.params.id));

    const { id } = req.params;
    const { password, passwordLama } = req.body;

    // Cek apakah user ada
    const existingUser = await prisma.users.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    // Validasi password lama
    const isMatch = await bcrypt.compare(passwordLama, existingUser.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Password lama tidak sesuai",
      });
    }

    // Hash password baru
    const hashedPass = await bcrypt.hash(password, 10);

    // Update password user
    const updatedUser = await prisma.users.update({
      where: { id: parseInt(id) },
      data: {
        password: hashedPass,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Password berhasil diupdate",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi Kesalahan",
      data: error,
    });
  }
});

app.listen(port, () => {
  console.log("Server running on http://localhost:" + port);
});
