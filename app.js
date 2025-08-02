const API_URL = "https://control-gastos-backend-tj2z.onrender.com";
let token = "";
let transacciones = [];

// --- PING para mantener backend activo cada 5 minutos ---
setInterval(() => {
  fetch(`${API_URL}/login`).catch(() => {});
}, 1000 * 60 * 5);

// --- Elementos del DOM ---
const modal = document.getElementById("loginModal");
const abrirLogin = document.getElementById("abrirLogin");
const cerrarModal = document.getElementById("cerrarModal");
const btnLogin = document.getElementById("btnLogin");
const cerrarSesionBtn = document.getElementById("cerrarSesion");
const loginMsg = document.getElementById("loginMsg");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");

const transactionForm = document.getElementById("transaction-form");
const transactionTable = document.querySelector("#transaction-table tbody");
const filtroNombre = document.getElementById("filtroNombre");
const filtroTipo = document.getElementById("filtroTipo");
const filtroFecha = document.getElementById("date");
const campoFecha = document.getElementById("transactionDate");

const editModal = document.getElementById("editModal");
const editDescripcion = document.getElementById("editDescripcion");
const editMonto = document.getElementById("editMonto");
const editTipo = document.getElementById("editTipo");
const editFecha = document.getElementById("editFecha");
const guardarEdicion = document.getElementById("guardarEdicion");
const cancelarEdicion = document.getElementById("cancelarEdicion");

let transaccionEditando = null;
let rolUsuario = "";

abrirLogin.onclick = () => (modal.style.display = "flex");
cerrarModal.onclick = () => (modal.style.display = "none");
cancelarEdicion.onclick = () => {
  editModal.style.display = "none";
  transaccionEditando = null;
};

btnLogin.onclick = async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    loginMsg.textContent = "Completa ambos campos.";
    return;
  }

  try {
    const res = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (data.token) {
      token = data.token;
      localStorage.setItem("token", token);
      modal.style.display = "none";
      mostrarDashboard();
      await cargarTransacciones();
    } else {
      loginMsg.textContent = data.message || "Credenciales inválidas.";
    }
  } catch (err) {
    loginMsg.textContent = "Error de conexión con el servidor.";
  }
};

cerrarSesionBtn.onclick = () => {
  localStorage.removeItem("token");
  token = "";
  location.reload();
};

function mostrarDashboard() {
  document.getElementById("transaction-form").style.display = "flex";
  document.querySelector(".filtros").style.display = "block";
  document.querySelector(".graficoSelect").style.display = "block";
  cerrarSesionBtn.style.display = "inline-block";
  abrirLogin.style.display = "none";
}

// 1️⃣ Función para agrupar transacciones por mes
function agruparPorMes(transacciones) {
  const resumen = {};
  transacciones.forEach((t) => {
    const mes = t.fecha.slice(0, 7); // yyyy-mm
    if (!resumen[mes]) resumen[mes] = { ingresos: 0, gastos: 0 };
    resumen[mes][t.tipo === "ingreso" ? "ingresos" : "gastos"] += t.monto;
  });
  return resumen;
}

// 2️⃣ Función para graficar
function actualizarGraficos() {
  const diferenciaDiv = document.getElementById("diferencia");
  const chartCanvas = document.getElementById("chartCanvas");
  const tipoSeleccionado =
    document.getElementById("graficoSelect")?.value || "pie";

  let chart; // si ya tenías una variable global chart, elimina esta

  const ingresos = transacciones
    .filter((t) => t.tipo === "ingreso")
    .reduce((sum, t) => sum + t.monto, 0);

  const gastos = transacciones
    .filter((t) => t.tipo === "gasto")
    .reduce((sum, t) => sum + t.monto, 0);

  const diferencia = ingresos - gastos;
  if (diferenciaDiv) {
    diferenciaDiv.textContent = `Diferencia: S/ ${diferencia.toFixed(2)}`;
  }

  if (!chartCanvas) return;

  if (chart) chart.destroy?.();

  if (tipoSeleccionado === "pie") {
    chart = new Chart(chartCanvas, {
      type: "pie",
      data: {
        labels: ["Ingresos", "Gastos"],
        datasets: [
          {
            data: [ingresos, gastos],
            backgroundColor: ["#4caf50", "#f44336"],
          },
        ],
      },
    });
  } else if (tipoSeleccionado === "bar") {
    const resumenMensual = agruparPorMes(transacciones);
    chart = new Chart(chartCanvas, {
      type: "bar",
      data: {
        labels: Object.keys(resumenMensual),
        datasets: [
          {
            label: "Ingresos",
            data: Object.values(resumenMensual).map((v) => v.ingresos),
            backgroundColor: "#4caf50",
          },
          {
            label: "Gastos",
            data: Object.values(resumenMensual).map((v) => v.gastos),
            backgroundColor: "#f44336",
          },
        ],
      },
    });
  }
}

// 3️⃣ Luego tu función cargarTransacciones
async function cargarTransacciones() {
  try {
    const res = await fetch(`${API_URL}/transacciones`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);

    transacciones = await res.json();

    // 🔽 Conversión correcta de campo monto
    transacciones = transacciones.map((t) => ({
      ...t,
      monto: Number(t.monto) || 0,
    }));

    rolUsuario = JSON.parse(atob(token.split(".")[1])).rol;

    renderTabla();
    actualizarGraficos();
  } catch (err) {
    console.error("Error al cargar transacciones:", err);
    if (err.message.includes("401") || err.message.includes("403")) {
      alert("Sesión expirada. Vuelve a iniciar sesión.");
      localStorage.removeItem("token");
      token = "";
      location.reload();
    }
  }
}

transactionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nueva = {
    tipo: document.getElementById("type").value,
    monto: parseFloat(document.getElementById("amount").value),
    descripcion: document.getElementById("description").value,
    fecha: campoFecha.value || new Date().toISOString().split("T")[0],
  };
  try {
    const res = await fetch(`${API_URL}/transacciones`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(nueva),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    await cargarTransacciones();
    transactionForm.reset();
  } catch (err) {
    console.error("Error al agregar transacción:", err);
    alert("No se pudo agregar la transacción.");
  }
});

function renderTabla() {
  transactionTable.innerHTML = "";
  const filtradas = transacciones.filter((t) => {
    return (
      (filtroNombre.value === "todos" || t.username === filtroNombre.value) &&
      (filtroTipo.value === "todos" || t.tipo === filtroTipo.value) &&
      (!filtroFecha.value || t.fecha === filtroFecha.value)
    );
  });

  filtradas.forEach((t) => {
    const row = document.createElement("tr");
    const fecha = new Date(t.fecha).toISOString().split("T")[0];
    row.innerHTML = `
      <td>${t.username || "Usuario"}</td>
      <td>${t.tipo}</td>
      <td>S/ ${Number(t.monto).toFixed(2)}</td>
      <td>${t.descripcion}</td>
      <td>${fecha}</td>
      <td>
        ${
          rolUsuario !== "admin"
            ? `<button class="editar" data-id="${t.id}">✏️</button>
               <button class="eliminar" data-id="${t.id}">🗑️</button>`
            : ""
        }
      </td>
    `;
    transactionTable.appendChild(row);
  });

  if (rolUsuario !== "admin") {
    document.querySelectorAll(".eliminar").forEach((btn) => {
      btn.addEventListener("click", () => eliminarTransaccion(btn.dataset.id));
    });
    document.querySelectorAll(".editar").forEach((btn) => {
      btn.addEventListener("click", () => abrirEdicion(btn.dataset.id));
    });
  }
}

async function eliminarTransaccion(id) {
  try {
    const res = await fetch(`${API_URL}/transacciones/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    await cargarTransacciones();
  } catch (err) {
    console.error("Error al eliminar:", err);
  }
}

function abrirEdicion(id) {
  const t = transacciones.find((x) => x.id == id);
  if (!t) return;
  transaccionEditando = id;
  editDescripcion.value = t.descripcion;
  editMonto.value = t.monto;
  editTipo.value = t.tipo;
  editFecha.value = t.fecha;
  editModal.style.display = "flex";
}

guardarEdicion.onclick = async () => {
  if (!transaccionEditando) return;
  const cambios = {
    descripcion: editDescripcion.value,
    monto: parseFloat(editMonto.value),
    tipo: editTipo.value,
    fecha: editFecha.value || new Date().toISOString().split("T")[0],
  };
  try {
    const res = await fetch(`${API_URL}/transacciones/${transaccionEditando}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(cambios),
    });
    if (!res.ok) throw new Error("Error al editar");
    editModal.style.display = "none";
    transaccionEditando = null;
    await cargarTransacciones();
  } catch (err) {
    console.error("Error al editar:", err);
  }
};

[filtroNombre, filtroTipo, filtroFecha].forEach((f) =>
  f.addEventListener("change", () => renderTabla())
);

if (localStorage.getItem("token")) {
  token = localStorage.getItem("token");
  mostrarDashboard();
  cargarTransacciones();
}

// --- Cerrar sesión manual ---
cerrarSesionBtn.onclick = () => {
  sessionStorage.setItem("cerradoManual", "true"); // Marcamos que cerró manualmente
  localStorage.removeItem("token");
  token = "";
  location.reload();
};

// --- Siempre cerrar sesión al abrir o recargar ---
if (
  !sessionStorage.getItem("redirected") &&
  !sessionStorage.getItem("cerradoManual")
) {
  alert("Tu sesión ha caducado. Ingresa nuevamente.");
  localStorage.removeItem("token");
  token = "";

  sessionStorage.setItem("redirected", "true");
  window.location.href = "/";
} else {
  sessionStorage.removeItem("redirected");
  sessionStorage.removeItem("cerradoManual"); // Resetea para próximas veces
}
document
  .getElementById("graficoSelect")
  .addEventListener("change", actualizarGraficos);
