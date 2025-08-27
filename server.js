import express from "express";
import qrcode from "qrcode";
import bodyParser from "body-parser";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 3000;

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
  const chave = "+5516993330441";
  const nome = "JOAO FELIPE";
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

// Rota para gerar QR Pix com dados do comprador
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
    quantidade
  };
  salvarPagamentos();

  const qr = await qrcode.toDataURL(payload);
  res.json({ qr, payload, total: total.toFixed(2), txid });
});

// Confirmar pagamento
app.post("/api/confirmar", (req, res) => {
  const { txid } = req.body;
  if (!pagamentos[txid]) return res.status(404).json({ error: "TxID não encontrado" });

  pagamentos[txid].confirmado = true;
  salvarPagamentos();
  res.json({ msg: "Pagamento confirmado", txid, info: pagamentos[txid] });
});

// Listar pagamentos
app.get("/api/pagamentos", (req, res) => {
  res.json(pagamentos);
});

app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
