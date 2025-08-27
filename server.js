import express from "express";
import qrcode from "qrcode";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rota do dashboard protegido
app.get("/dashboard", basicAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

app.use(bodyParser.json());
app.use(express.static("."));

// Persistência de pagamentos
let pagamentos = {};
const ARQUIVO = "pagamentos.json";

if (fs.existsSync(ARQUIVO)) {
  pagamentos = JSON.parse(fs.readFileSync(ARQUIVO));
}

function salvarPagamentos() {
  fs.writeFileSync(ARQUIVO, JSON.stringify(pagamentos, null, 2));
}

// --- Autenticação básica ---
const AUTH_USER = "mariana";
const AUTH_PASS = "J784yrX2"; // altere para uma senha forte

function basicAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Área restrita"');
    return res.status(401).send("Autenticação necessária.");
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString("ascii");
  const [user, pass] = credentials.split(":");

  if (user === AUTH_USER && pass === AUTH_PASS) {
    next();
  } else {
    res.setHeader("WWW-Authenticate", 'Basic realm="Área restrita"');
    return res.status(401).send("Usuário ou senha incorretos.");
  }
}

// Funções Pix (crc16, montaCampo, gerarPix)
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function montaCampo(id, valor) {
  const tamanho = valor.length.toString().padStart(2, "0");
  return id + tamanho + valor;
}

function gerarPix(valor, txid) {
  const chave = "entregas@cenourao.com.br"; 
  const nome = "CENOURAO VAREJAO";
  const cidade = "RIBEIRAO PRETO";

  const gui = "BR.GOV.BCB.PIX";
  const mp = montaCampo("00", gui) + montaCampo("01", chave);
  const mpCompleto = montaCampo("26", mp);

  const valorStr = valor.toFixed(2);

  let payload =
    "000201" +
    mpCompleto +
    "52040000" +
    "5303986" +
    montaCampo("54", valorStr) +
    "5802BR" +
    montaCampo("59", nome) +
    montaCampo("60", cidade) +
    montaCampo("62", montaCampo("05", txid)) +
    "6304";

  const crc = crc16(payload);
  payload += crc;
  return payload;
}

// --- Rotas ---
app.get("/api/pix", async (req, res) => {
  const { qtd, nome, cpf, telefone } = req.query;
  const quantidade = parseInt(qtd) || 1;
  const total = quantidade * 0.05;

  const txid = "ING" + Date.now().toString().slice(-10);
  const payload = gerarPix(total, txid);

  pagamentos[txid] = {
    total: total.toFixed(2),
    confirmado: false,
    comprador: { nome, cpf, telefone },
    quantidade,
    geradoEm: new Date().toISOString()
  };
  salvarPagamentos();

  const qr = await qrcode.toDataURL(payload);
  res.json({ qr, payload, total: total.toFixed(2), txid });
});

app.post("/api/confirmar", (req, res) => {
  const { txid } = req.body;
  if (!pagamentos[txid]) return res.status(404).json({ error: "TxID não encontrado" });

  pagamentos[txid].confirmado = true;
  pagamentos[txid].confirmadoEm = new Date().toISOString();
  salvarPagamentos();
  res.json({ msg: "Pagamento confirmado", txid, info: pagamentos[txid] });
});

// Dashboard protegido
app.get("/api/pagamentos", basicAuth, (req, res) => {
  res.json(pagamentos);
});

app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));



