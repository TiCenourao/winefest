import express from "express";
import qrcode from "qrcode";
import bodyParser from "body-parser";

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(express.static("public"));

// Banco de dados simples em memória para txID
let pagamentos = {}; // { txid: { total, confirmado: false } }

// Função CRC16 CCITT-FALSE
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
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

// Rota para gerar QR
app.get("/api/pix", async (req, res) => {
  const quantidade = parseInt(req.query.qtd) || 1;
  const valorUnitario = 0.05;
  const total = quantidade * valorUnitario;

  const txid = "ING" + Date.now().toString().slice(-10); // txid dinâmico
  const payload = gerarPix(total, txid);

  pagamentos[txid] = { total: total.toFixed(2), confirmado: false };

  const qr = await qrcode.toDataURL(payload);
  res.json({ qr, payload, total: total.toFixed(2), txid });
});

// Rota para marcar pagamento confirmado manualmente
app.post("/api/confirmar", (req, res) => {
  const { txid } = req.body;
  if (!pagamentos[txid]) return res.status(404).json({ error: "TxID não encontrado" });

  pagamentos[txid].confirmado = true;
  res.json({ msg: "Pagamento confirmado", txid, info: pagamentos[txid] });
});

// Rota para listar pagamentos (para administração)
app.get("/api/pagamentos", (req, res) => {
  res.json(pagamentos);
});

app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
