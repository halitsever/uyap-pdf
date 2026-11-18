/** Hand-built UDF documents covering the features the UDF to PDF converter renders. */
import { crc32, deflateSync } from "node:zlib";
import JSZip from "jszip";

export const TURKISH = "ğüşıöçİĞÜŞÖÇ";

/** Solid-colour RGB PNG, so fixtures carry real image data without binary files in the repo. */
export function solidPng(width: number, height: number, rgb: [number, number, number]): string {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return png.toString("base64");
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Appends text to the pool and hands back elements that point at it. */
export class Pool {
  text = "";

  private at(s: string): string {
    const start = this.text.length;
    this.text += s;
    return `startOffset="${start}" length="${s.length}"`;
  }

  content(s: string, attrs = ""): string {
    return `<content ${attrs} ${this.at(s)} />`;
  }
  field(name: string, s: string, attrs = ""): string {
    return `<field fieldType="1" isList="false" fieldName="${name}" ${attrs} ${this.at(s)} />`;
  }
  tab(attrs = ""): string {
    return `<tab ${attrs} ${this.at("\t")} />`;
  }
  image(base64: string, width: number, height: number): string {
    return `<image imageData="${base64}" width="${width}" height="${height}" ${this.at("￼")} />`;
  }
  paragraph(attrs: string, ...children: string[]): string {
    return `<paragraph ${attrs}>${children.join("")}${this.content("\n")}</paragraph>`;
  }
  empty(attrs = ""): string {
    return `<paragraph ${attrs}>${this.content("​\n")}</paragraph>`;
  }
}

export interface FixtureParts {
  formatId?: string;
  pageFormat?: string;
  extraProperties?: string;
  elements: string;
  elementsAttrs?: string;
  styles?: string;
  files?: Record<string, string>;
}

const BASE_STYLES =
  '<style name="default" description="Geçerli" family="Dialog" size="12" bold="false" italic="false" foreground="-13421773" />' +
  '<style name="hvl-default" family="Times New Roman" size="12" description="Gövde" />';

export function contentXml(pool: Pool, parts: FixtureParts): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" ?>\n<template format_id="${parts.formatId ?? "1.8"}">\n` +
    `<content><![CDATA[${pool.text}]]></content>` +
    `<properties>${parts.pageFormat ?? '<pageFormat mediaSizeName="1" leftMargin="42.52" rightMargin="28.35" topMargin="42.52" bottomMargin="42.52" paperOrientation="1" headerFOffset="20.0" footerFOffset="20.0" />'}${parts.extraProperties ?? ""}</properties>\n` +
    `<elements ${parts.elementsAttrs ?? 'resolver="hvl-default"'}>\n${parts.elements}\n</elements>\n` +
    `<styles>${parts.styles ?? BASE_STYLES}</styles>\n</template>\n`
  );
}

export async function zipUdf(xml: string, files: Record<string, string> = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("content.xml", xml);
  for (const [name, data] of Object.entries(files)) zip.file(name, data);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/** Modelled on the template the official editor ships: format 1.7, named styles, fields between tabs. */
export function fieldsFixture(): string {
  const p = new Pool();
  const tabs = 'TabSet="14.17:0:0,28.35:0:0,85.04:0:0,141.73:0:0,212.6:0:0"';
  const elements = [
    p.paragraph('resolver="hvl-default"', p.field("mahkeme", "ANKARA 3. İŞ MAHKEMESİ", 'resolver="edf_baslik"')),
    p.paragraph(`Alignment="0" ${tabs}`, p.content("DOSYA NO", 'bold="true"'), p.tab(), p.content(":"), p.tab(), p.field("esasNo", "2026/481 Esas")),
    p.paragraph(`Alignment="0" ${tabs}`, p.content("DAVACI", 'bold="true"'), p.tab(), p.content(":"), p.tab(), p.field("davaci", `Ayşe Gül Çınar (${TURKISH})`)),
    p.paragraph(`Alignment="0" ${tabs}`, p.content("Önce "), p.field("alanBir", "BİRİNCİ"), p.content(" sonra "), p.field("alanIki", "İKİNCİ"), p.content(" en son ÜÇÜNCÜ.")),
    p.paragraph('Alignment="2" TabSet="300:1:1"', p.content("Toplam"), p.tab(), p.content("1.250,00 TL")),
    p.empty(),
    p.paragraph('Alignment="1"', p.content("SONUÇ", 'resolver="edf_baslik"')),
  ].join("");
  return contentXml(p, {
    formatId: "1.7",
    pageFormat:
      '<pageFormat mediaSizeName="8" leftMargin="8.5" rightMargin="5.67" topMargin="8.5" bottomMargin="5.67" paperOrientation="1" headerFOffset="20.0" footerFOffset="20.0" />',
    elementsAttrs: "",
    styles: BASE_STYLES + '<style name="edf_baslik" resolver="hvl-default" family="Arial" size="14" bold="true" description="Başlık" />',
    elements,
  });
}

export function tablesFixture(): string {
  const p = new Pool();
  const cell = (attrs: string, text: string) => `<cell ${attrs}>${p.paragraph('Alignment="0"', p.content(text))}</cell>`;
  const border = 'borderWidth="1.0" borderColor="-16777216" borderSpec="15" borderStyle="borderStyle-solid"';
  const nested =
    `<table tableName="Ic" columnCount="2" columnSpans="60,60" border="borderCell">` + `<row rowName="r1">${cell(border, "iç A")}${cell(border, "iç B")}</row></table>`;
  const elements = [
    p.paragraph('Alignment="1"', p.content("TABLO ÖRNEĞİ", 'bold="true" size="14"')),
    `<table tableName="Sabit" columnCount="3" columnSpans="120,180,200" border="borderCell">` +
      `<row rowName="row1" rowType="dataRow">${cell(`rowspan="2" align="vcenter" fillColor="-1118482" ${border}`, "Birleşik satır")}${cell(`colspan="2" ${border}`, "Birleşik sütun ğüşıöç")}</row>` +
      `<row rowName="row2" rowType="dataRow">${cell(border, "Hücre B2")}${cell(`${border} borderStyle="borderStyle-dashed"`, "Hücre C2")}</row>` +
      `<row rowName="row3" rowType="dataRow">${cell(`borderSpec="5" ${border.replace('borderSpec="15"', "")}`, "Üst ve alt kenar")}<cell ${border}>${nested}</cell>${cell('border="borderNone"', "Kenarsız")}</row>` +
      `</table>`,
    p.paragraph("", p.content("Tablodan sonraki paragraf.")),
    `<table columnCount="2" columnSpans="1,1"><row>${cell("", "Oransal sol")}${cell("", "Oransal sağ")}</row></table>`,
  ].join("");
  return contentXml(p, { elements });
}

export function headerFooterFixture(): string {
  const p = new Pool();
  const logo = solidPng(40, 20, [11, 44, 71]);
  const header = `<header>${p.paragraph('Alignment="0"', p.image(logo, 40, 20), p.content(" T.C. İSTANBUL ANADOLU ADLİYESİ", 'bold="true"'))}</header>`;
  const body: string[] = [];
  for (let i = 1; i <= 30; i++) {
    body.push(
      p.paragraph(
        'Alignment="3" FirstLineIndent="28.35" LineSpacing="0.5"',
        p.content(`${i}. Davacı vekili ${TURKISH} olarak beyan ederiz; dosyadaki belgeler incelendiğinde talebin yerinde olduğu anlaşılmaktadır.`),
      ),
    );
    if (i === 3) body.push(`<page-break>${p.empty()}</page-break>`);
  }
  const footer = `<footer pageNumber-spec="BSP32_2088" pageNumber-seperator="/" pageNumber-fontFace="Arial" pageNumber-fontSize="9" pageNumber-color="-16777216" pageNumber-foreStr="Sayfa " pageNumber-pageStartNumStr="">${p.paragraph('Alignment="0"', p.content("Altbilgi: gizli belge", 'italic="true" size="9"'))}</footer>`;
  return contentXml(p, {
    pageFormat:
      '<pageFormat mediaSizeName="1" leftMargin="42.52" rightMargin="42.52" topMargin="28.35" bottomMargin="28.35" paperOrientation="2" headerFOffset="20.0" footerFOffset="20.0" />',
    extraProperties: `<bgImage bgImageSource="antet" bgImageData="${solidPng(8, 8, [238, 243, 248])}" bgImageUpMargin="10" bgImageLeftMargin="10" bgImageBottomMargin="10" bgImageRigtMargin="10" />`,
    elements: header + body.join("") + footer,
  });
}

export function listsFixture(): string {
  const p = new Pool();
  const elements = [
    p.paragraph('Alignment="1"', p.content("LİSTE VE BİÇİM", 'bold="true" family="Arial" size="13"')),
    p.paragraph('Numbered="true" NumberType="NUMBER_TYPE_NUMBER_DOT" ListId="1" ListLevel="0" LeftIndent="25"', p.content("Birinci madde.")),
    p.paragraph('Numbered="true" NumberType="NUMBER_TYPE_NUMBER_DOT" ListId="1" ListLevel="0" LeftIndent="25"', p.content("İkinci madde.")),
    p.paragraph('Bulleted="true" BulletType="BULLET_TYPE_ELLIPSE" ListId="2" ListLevel="0" LeftIndent="25"', p.content("Madde işaretli satır.")),
    p.paragraph('Numbered="true" NumberType="NUMBER_TYPE_ROMAN_BIG_PARENTHESIS" ListId="3" LeftIndent="25"', p.content("Roma rakamı.")),
    p.paragraph(
      "",
      p.content("Kalın ", 'bold="true"'),
      p.content("italik ", 'italic="true"'),
      p.content("altı çizili ", 'underline="true"'),
      p.content("üstü çizili ", 'strikethrough="true"'),
      p.content("kırmızı ", 'foreground="-65536"'),
      p.content("sarı zemin", 'background="-256"'),
      p.content(" H"),
      p.content("2", 'subscript="true"'),
      p.content("O m"),
      p.content("2", 'superscript="true"'),
    ),
    p.paragraph(
      'TabSet="113.0:0:0" Hanging="113.0" Alignment="3"',
      p.content("KONU"),
      p.tab(),
      p.content(": Asılı girintili uzun bir konu satırı, değer kendi altında devam etsin diye iki satıra yayılacak kadar uzun yazıldı."),
    ),
    p.paragraph('Alignment="0"', p.content("Courier satırı", 'family="Courier New"')),
    `<mystery-block>${p.paragraph("", p.content("Bilinmeyen öğe içindeki metin korunur."))}</mystery-block>`,
    `<paragraph><content ${"startOffset"}="${p.text.length}" length="0" /><barcode ${"startOffset"}="${p.text.length}" length="11" /></paragraph>`,
  ];
  p.text += "BARKOD-1234\n";
  return contentXml(p, { elements: elements.join("") });
}
