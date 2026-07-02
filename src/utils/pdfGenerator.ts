import PDFDocument from "pdfkit";
import { Writable } from "stream";

interface ReportMember {
  nome: string;
  cpf: string;
  classificacao: string;
  status_pessoa: string;
  periodo: string;
  func_confirmou: number;
  datahora_checkin?: string | null;
}

interface ScaleReportData {
  numero_os: number;
  data_evento: string;
  cliente_nome: string;
  loja_nome: string;
  coordenador_nome: string;
  members: ReportMember[];
  mostrar_checkin?: boolean;
}

export function generateScalePdf(data: ScaleReportData, stream: Writable): void {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(stream);

  // Header
  doc.rect(0, 0, 595, 80).fill("#1e3a8a");
  doc.fillColor("#ffffff")
     .fontSize(20)
     .font("Helvetica-Bold")
     .text("DATASITE", 40, 20)
     .fontSize(10)
     .font("Helvetica")
     .text("RELATÓRIO DE MONITORAMENTO E ALOCAÇÃO DE ESCALA", 40, 45);

  // Date and Page Metadata
  const dateStr = new Date(data.data_evento).toLocaleDateString("pt-BR", { timeZone: "UTC" });
  doc.fillColor("#ffffff")
     .fontSize(9)
     .text(`Emissão: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`, 400, 25, { align: "right", width: 155 })
     .text(`Data do Inventário: ${dateStr}`, 400, 40, { align: "right", width: 155 });

  doc.moveDown(4);

  // OS Details Box
  doc.fillColor("#1e293b");
  doc.rect(40, doc.y, 515, 75).fill("#f8fafc");
  doc.rect(40, doc.y, 515, 75).stroke("#e2e8f0");
  
  const originalY = doc.y;
  doc.fillColor("#0f172a")
     .fontSize(11)
     .font("Helvetica-Bold")
     .text(`Ordem de Serviço: OS-${data.numero_os}`, 50, originalY + 10)
     .font("Helvetica")
     .fontSize(10)
     .text(`Cliente: ${data.cliente_nome}`, 50, originalY + 30)
     .text(`Loja: ${data.loja_nome}`, 50, originalY + 45)
     .text(`Coordenador: ${data.coordenador_nome || "Não alocado"}`, 50, originalY + 60);

  doc.y = originalY + 90;

  // Title section
  doc.fillColor("#1e3a8a")
     .fontSize(12)
     .font("Helvetica-Bold")
     .text("COLABORADORES ESCALADOS E ALOCADOS", 40, doc.y)
     .strokeColor("#1e3a8a")
     .moveTo(40, doc.y + 15)
     .lineTo(555, doc.y + 15)
     .stroke();

  doc.y += 25;

  // Table Headers
  const tableTop = doc.y;
  doc.fillColor("#475569")
     .fontSize(9)
     .font("Helvetica-Bold")
     .text("NOME", 45, tableTop)
     .text("CPF", 260, tableTop)
     .text("RANKING", 370, tableTop)
     .text("PERÍODO", 440, tableTop)
     .text("STATUS", 500, tableTop);

  doc.strokeColor("#cbd5e1")
     .moveTo(40, tableTop + 15)
     .lineTo(555, tableTop + 15)
     .stroke();

  doc.y = tableTop + 20;

  // Draw Members Rows
  let currentY = doc.y;
  doc.font("Helvetica").fontSize(9).fillColor("#0f172a");
  
  data.members.forEach((m, idx) => {
    // Page overflow safety
    if (currentY > 750) {
      doc.addPage();
      currentY = 50;
      doc.fillColor("#475569")
         .fontSize(9)
         .font("Helvetica-Bold")
         .text("NOME", 45, currentY)
         .text("CPF", 260, currentY)
         .text("RANKING", 370, currentY)
         .text("PERÍODO", 440, currentY)
         .text("STATUS", 500, currentY);
      doc.strokeColor("#cbd5e1")
         .moveTo(40, currentY + 15)
         .lineTo(555, currentY + 15)
         .stroke();
      currentY += 20;
      doc.font("Helvetica").fontSize(9).fillColor("#0f172a");
    }

    // Zebra striping
    if (idx % 2 === 1) {
      doc.rect(40, currentY - 3, 515, 18).fill("#f8fafc");
      doc.fillColor("#0f172a");
    }

    const cleanCpf = m.cpf || "—";
    
    let statusText = m.status_pessoa;
    if (data.mostrar_checkin !== false) {
      if (m.func_confirmou === 1) {
        const timeStr = m.datahora_checkin 
          ? new Date(m.datahora_checkin).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })
          : "";
        statusText = `Presente ${timeStr ? `(${timeStr})` : ""}`;
      } else {
        statusText = "Aguardando Check-in";
      }
    } else {
      statusText = m.func_confirmou === 1 ? "Alocado" : "Pendente";
    }

    doc.text(m.nome || "Não informado", 45, currentY, { width: 205, height: 12, lineBreak: false })
       .text(cleanCpf, 260, currentY)
       .text(m.classificacao || "—", 370, currentY)
       .text(m.periodo || "Integral", 440, currentY)
       .text(statusText, 500, currentY);

    currentY += 18;
  });

  doc.y = currentY + 15;

  // Summary and metrics
  const confirmedCount = data.members.filter(m => m.func_confirmou === 1).length;
  const pendingCount = data.members.filter(m => m.func_confirmou !== 1).length;
  const labelConfirmed = data.mostrar_checkin !== false ? "Presentes" : "Confirmados";
  const labelPending = data.mostrar_checkin !== false ? "Pendentes" : "Não Confirmados";

  doc.rect(40, doc.y, 515, 35).fill("#eff6ff");
  doc.rect(40, doc.y, 515, 35).stroke("#bfdbfe");

  doc.fillColor("#1e3a8a")
     .fontSize(10)
     .font("Helvetica-Bold")
     .text(`Resumo Geral:  ${data.members.length} Alocados  |  ${confirmedCount} ${labelConfirmed}  |  ${pendingCount} ${labelPending}`, 50, doc.y + 12);

  doc.end();
}
