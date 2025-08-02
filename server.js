const express = require("express");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || "clave_super_segura";

const app = express();

// --- CORS ---
const corsOptions = {
  origin: "https://control-gastos-bacend.vercel.app",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));
app.use(express.json());

// --- PostgreSQL ---
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false },
});

pool
  .connect()
  .then(() => console.log("✅ Conectado a PostgreSQL"))
  .catch((err) => {
    console.error("❌ Error al conectar con PostgreSQL:", err.message);
    process.exit(1);
  });

// --- Autenticación JWT ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// --- Login ---
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM usuarios WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0 || result.rows[0].password !== password) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username, rol: user.rol },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ message: "Login exitoso", token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

// --- Obtener transacciones ---
app.get("/transacciones", authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT 
        t.id, t.tipo, t.monto, t.descripcion, t.fecha, u.username 
      FROM transacciones t 
      JOIN usuarios u ON t.usuario_id = u.id
    `;
    const params = [];

    if (req.user.rol !== "admin") {
      query += " WHERE t.usuario_id = $1";
      params.push(req.user.id);
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener transacciones" });
  }
});

// --- Crear transacción ---
app.post("/transacciones", authenticateToken, async (req, res) => {
  if (req.user.rol === "admin") {
    return res
      .status(403)
      .json({ message: "El administrador no puede crear transacciones" });
  }

  try {
    const { tipo, monto, descripcion, fecha } = req.body;

    const result = await pool.query(
      `INSERT INTO transacciones (usuario_id, tipo, monto, "Descripción", fecha)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, tipo, monto, "Descripción" AS descripcion, fecha`,
      [req.user.id, tipo, monto, descripcion, fecha]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al crear transacción" });
  }
});

// --- Editar transacción ---
app.put("/transacciones/:id", authenticateToken, async (req, res) => {
  if (req.user.rol === "admin") {
    return res
      .status(403)
      .json({ message: "El administrador no puede editar transacciones" });
  }

  try {
    const { id } = req.params;
    const { tipo, monto, descripcion, fecha } = req.body;

    const result = await pool.query(
      `UPDATE transacciones 
       SET tipo = $1, monto = $2, "Descripción" = $3, fecha = $4 
       WHERE id = $5 AND usuario_id = $6`,
      [tipo, monto, descripcion, fecha, id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: "No se encontró la transacción o no tienes permiso" });
    }

    res.json({ message: "Transacción actualizada" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al actualizar transacción" });
  }
});

// --- Eliminar transacción ---
app.delete("/transacciones/:id", authenticateToken, async (req, res) => {
  if (req.user.rol === "admin") {
    return res
      .status(403)
      .json({ message: "El administrador no puede eliminar transacciones" });
  }

  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM transacciones WHERE id = $1 AND usuario_id = $2",
      [id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: "No se encontró la transacción o no tienes permiso" });
    }

    res.json({ message: "Transacción eliminada" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al eliminar transacción" });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
