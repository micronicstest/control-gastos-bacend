const express = require("express");
const mysql = require("mysql2/promise");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");

const PORT = process.env.PORT || 8000;

const app = express();

// --- Configuración de MariaDB ---
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
};

let db;
(async () => {
  try {
    db = await mysql.createConnection(dbConfig);
    console.log("✅ Conectado a MariaDB");
  } catch (err) {
    console.error("❌ Error al conectar con la base de datos:", err.message);
    process.exit(1); // Detiene el servidor si no hay conexión
  }
})();

const JWT_SECRET = "clave_super_segura";

app.use(cors());
app.use(express.json());

// --- Middleware de autenticación ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user; // { id, username, rol }
    next();
  });
}

// --- Login ---
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const [rows] = await db.execute(
      "SELECT * FROM usuarios WHERE username = ?",
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const user = rows[0];
    const isPasswordCorrect = password === user.password; // Comparación simple (texto plano)

    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

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
      SELECT t.Id, t.Tipo, t.Monto, t.Descripción, t.Fecha, u.username 
      FROM transacciones t 
      JOIN usuarios u ON t.usuario_id = u.id
    `;
    const params = [];

    if (req.user.rol !== "admin") {
      query += " WHERE t.usuario_id = ?";
      params.push(req.user.id);
    }

    const [rows] = await db.execute(query, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener transacciones" });
  }
});

// --- Crear transacción ---
app.post("/transacciones", authenticateToken, async (req, res) => {
  // ⛔ Evitar que el admin cree transacciones
  if (req.user.rol === "admin") {
    return res
      .status(403)
      .json({ message: "El administrador no puede crear transacciones" });
  }

  try {
    const { tipo, monto, descripcion, fecha } = req.body;

    const [result] = await db.execute(
      "INSERT INTO transacciones (usuario_id, Tipo, Monto, Descripción, Fecha) VALUES (?, ?, ?, ?, ?)",
      [req.user.id, tipo, monto, descripcion, fecha]
    );

    res.status(201).json({
      Id: result.insertId,
      Tipo: tipo,
      Monto: monto,
      Descripción: descripcion,
      Fecha: fecha,
      usuario_id: req.user.id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al crear transacción" });
  }
});

// --- Editar transacción (admin no puede) ---
app.put("/transacciones/:id", authenticateToken, async (req, res) => {
  if (req.user.rol === "admin") {
    return res
      .status(403)
      .json({ message: "El administrador no puede editar transacciones" });
  }

  try {
    const { id } = req.params;
    const { tipo, monto, descripcion, fecha } = req.body;

    const [result] = await db.execute(
      "UPDATE transacciones SET Tipo = ?, Monto = ?, Descripción = ?, Fecha = ? WHERE Id = ? AND usuario_id = ?",
      [tipo, monto, descripcion, fecha, id, req.user.id]
    );

    if (result.affectedRows === 0) {
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

// --- Eliminar transacción (admin no puede) ---
app.delete("/transacciones/:id", authenticateToken, async (req, res) => {
  if (req.user.rol === "admin") {
    return res
      .status(403)
      .json({ message: "El administrador no puede eliminar transacciones" });
  }

  try {
    const { id } = req.params;

    const [result] = await db.execute(
      "DELETE FROM transacciones WHERE Id = ? AND usuario_id = ?",
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
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
