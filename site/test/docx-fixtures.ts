/** A hand-built .docx shaped like Word's own output: theme fonts, styles with basedOn, numbering, fields, rsids. */
import JSZip from "jszip";
import { solidPng } from "./udf-fixtures.js";

const NS =
  'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
  'xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" ' +
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ' +
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" mc:Ignorable="w14"';

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

export const LOGO = solidPng(48, 24, [11, 44, 71]);

const r = (text: string, rPr = "") => `<w:r w:rsidR="00A1">${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const p = (pPr: string, ...runs: string[]) => `<w:p w:rsidR="00A1" w14:paraId="1A2B3C4D">${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${runs.join("")}</w:p>`;
const tc = (tcPr: string, ...paras: string[]) => `<w:tc><w:tcPr>${tcPr}</w:tcPr>${paras.join("") || p("")}</w:tc>`;

const image = (rid: string, cx: number, cy: number, anchor = false) =>
  `<w:r><w:drawing><wp:${anchor ? 'anchor behindDoc="0" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="1" locked="0" layoutInCell="1" allowOverlap="1"' : 'inline distT="0" distB="0" distL="0" distR="0"'}>` +
  `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Resim 1"/>` +
  `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
  `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
  `</a:graphicData></a:graphic></wp:${anchor ? "anchor" : "inline"}></w:drawing></w:r>`;

const textBox =
  `<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="2" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">` +
  `<wp:extent cx="1800000" cy="400000"/><wp:docPr id="2" name="Metin Kutusu 2"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:txbx><w:txbxContent>` +
  p("", r("Kutu içindeki metin")) +
  `</w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>` +
  `<mc:Fallback><w:pict><v:shape style="width:142pt;height:31pt"><v:textbox><w:txbxContent>${p("", r("Kutu içindeki metin"))}</w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>`;

const field = (code: string, shown: string, rPr = "") =>
  `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${code} \\* MERGEFORMAT </w:instrText></w:r>` +
  `<w:r><w:fldChar w:fldCharType="separate"/></w:r>${r(shown, rPr)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;

export const TURKISH = "ğüşıöçİĞÜŞÖÇ";

function documentXml(): string {
  const body = [
    p('<w:pStyle w:val="Balk1"/>', r("T.C. ANKARA 3. İŞ MAHKEMESİ")),
    p(
      '<w:jc w:val="both"/><w:spacing w:line="360" w:lineRule="auto"/><w:ind w:firstLine="709"/>',
      r("Davacı "),
      r("vekili", "<w:i/>"),
      r(" olarak "),
      r("beyan", '<w:u w:val="single"/>'),
      r(" ederiz "),
      `<w:del w:id="1" w:author="A" w:date="2026-01-01T00:00:00Z"><w:r><w:delText>SİLİNEN</w:delText></w:r></w:del>`,
      `<w:ins w:id="2" w:author="A" w:date="2026-01-01T00:00:00Z">${r("eklenen ")}</w:ins>`,
      r("GİZLİ", "<w:vanish/>"),
      r("önemli", '<w:b/><w:color w:val="C00000"/>'),
      r(" "),
      r("sarı", '<w:highlight w:val="yellow"/>'),
      r(" m"),
      r("2", '<w:vertAlign w:val="superscript"/>'),
      r(" "),
      r("çizili", "<w:strike/>"),
      r(" "),
      r("istanbul", "<w:caps/>"),
      r(` ${TURKISH}`, '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/>'),
    ),
    p('<w:tabs><w:tab w:val="left" w:pos="2268"/></w:tabs><w:ind w:left="2268" w:hanging="2268"/>', r("DAVACI"), "<w:r><w:tab/></w:r>", r(": Mehmet Yılmaz, uzun bir açıklama satırı ki asılı girinti altında sürsün.")),
    p('<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9072"/></w:tabs>', r("Toplam"), "<w:r><w:tab/></w:r>", r("1.250,00 TL")),
    p('<w:pStyle w:val="ListeParagraf"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>', r("Birinci madde")),
    p('<w:pStyle w:val="ListeParagraf"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>', r("İkinci madde")),
    p('<w:pStyle w:val="ListeParagraf"/><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>', r("Alt madde")),
    p('<w:pStyle w:val="ListeParagraf"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>', r("Üçüncü madde")),
    p('<w:pStyle w:val="ListeParagraf"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>', r("Madde işaretli")),
    p('<w:pStyle w:val="ListeParagraf"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr>', r("Yeniden bir")),
    `<w:tbl><w:tblPr><w:tblStyle w:val="TabloKlavuzu"/><w:tblW w:w="9000" w:type="dxa"/><w:tblLook w:val="04A0"/></w:tblPr>` +
      `<w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="3000"/><w:gridCol w:w="4000"/></w:tblGrid>` +
      `<w:tr><w:trPr><w:trHeight w:val="400"/></w:trPr>${tc('<w:tcW w:w="5000" w:type="dxa"/><w:gridSpan w:val="2"/><w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>', p("", r("Birleşik sütun", "<w:b/>")))}${tc('<w:tcW w:w="4000" w:type="dxa"/>', p("", r("C1")))}</w:tr>` +
      `<w:tr>${tc('<w:tcW w:w="2000" w:type="dxa"/><w:vMerge w:val="restart"/><w:vAlign w:val="center"/>', p("", r("Dikey")))}${tc('<w:tcW w:w="3000" w:type="dxa"/>', p("", r("B2")))}${tc('<w:tcW w:w="4000" w:type="dxa"/>', p("", r("C2")))}</w:tr>` +
      `<w:tr>${tc('<w:tcW w:w="2000" w:type="dxa"/><w:vMerge/>')}${tc('<w:tcW w:w="3000" w:type="dxa"/>', p("", r("B3")))}${tc('<w:tcW w:w="4000" w:type="dxa"/><w:tcBorders><w:bottom w:val="double" w:sz="12" w:space="0" w:color="FF0000"/></w:tcBorders>', p("", r("C3")))}</w:tr>` +
      `</w:tbl>`,
    p("", r("Satır bir"), "<w:r><w:br/></w:r>", r("satır iki")),
    p("", r("Sayfa sonu öncesi"), '<w:r><w:br w:type="page"/></w:r>', r("Sayfa sonu sonrası")),
    p('<w:jc w:val="center"/>', image("rId10", 914400, 457200), r(" logo")),
    p("", r("Dipnotlu cümle"), `<w:r><w:rPr><w:rStyle w:val="DipnotBavurusu"/></w:rPr><w:footnoteReference w:id="1"/></w:r>`, r(".")),
    p("", textBox, r("Kutudan sonra")),
    p('<w:pageBreakBefore/>', r("Yeni sayfada başlayan paragraf")),
    `<w:sectPr w:rsidR="00A1"><w:headerReference w:type="default" r:id="rId20"/><w:footerReference w:type="default" r:id="rId21"/>` +
      `<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/>` +
      `<w:pgNumType w:start="1"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>`,
  ];
  return `${HEAD}<w:document ${NS}><w:body>${body.join("")}</w:body></w:document>`;
}

function stylesXml(): string {
  return (
    `${HEAD}<w:styles ${NS}>` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:eastAsiaTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:cstheme="minorBidi"/><w:kern w:val="2"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="tr-TR" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:latentStyles w:defLockedState="0" w:defUIPriority="99"/>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Balk1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="28"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="ListeParagraf"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>` +
    `<w:style w:type="character" w:default="1" w:styleId="VarsaylanParagrafYazTipi"><w:name w:val="Default Paragraph Font"/></w:style>` +
    `<w:style w:type="character" w:styleId="DipnotBavurusu"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>` +
    `<w:style w:type="table" w:default="1" w:styleId="NormalTablo"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/></w:tblPr></w:style>` +
    `<w:style w:type="table" w:styleId="TabloKlavuzu"><w:name w:val="Table Grid"/><w:basedOn w:val="NormalTablo"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>` +
    `<w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr></w:style>` +
    `</w:styles>`
  );
}

function numberingXml(): string {
  const lvl = (ilvl: number, fmt: string, text: string, left: number, extra = "") =>
    `<w:lvl w:ilvl="${ilvl}" w:tplc="041F000F"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${left}" w:hanging="360"/></w:pPr>${extra}</w:lvl>`;
  return (
    `${HEAD}<w:numbering ${NS}>` +
    `<w:abstractNum w:abstractNumId="0" w15:restartNumberingAfterBreak="0" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"><w:multiLevelType w:val="hybridMultilevel"/>${lvl(0, "decimal", "%1.", 720)}${lvl(1, "lowerLetter", "%2)", 1440)}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${lvl(0, "bullet", "", 720, '<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr>')}</w:abstractNum>` +
    `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>` +
    `<w:num w:numId="3"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>` +
    `</w:numbering>`
  );
}

const THEME =
  `${HEAD}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Teması"><a:themeElements><a:fontScheme name="Office">` +
  `<a:majorFont><a:latin typeface="Calibri Light" panose="020F0302020204030204"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
  `<a:minorFont><a:latin typeface="Calibri" panose="020F0502020204030204"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`;

function headerXml(): string {
  return `${HEAD}<w:hdr ${NS}>${p('<w:pStyle w:val="Normal"/><w:jc w:val="right"/>', r("T.C. İSTANBUL ADLİYESİ", "<w:b/>"))}</w:hdr>`;
}

function footerXml(): string {
  return (
    `${HEAD}<w:ftr ${NS}>` +
    p("", r("Gizli belge", "<w:i/>")) +
    p('<w:jc w:val="center"/>', r("Sayfa "), field("PAGE", "1"), r(" / "), `<w:fldSimple w:instr=" NUMPAGES  \\* Arabic  \\* MERGEFORMAT ">${r("3")}</w:fldSimple>`) +
    `</w:ftr>`
  );
}

function footnotesXml(): string {
  return (
    `${HEAD}<w:footnotes ${NS}>` +
    `<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>` +
    `<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>` +
    `<w:footnote w:id="1">${p("", `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteRef/></w:r>`, r(" Yargıtay 9. HD kararı."))}</w:footnote>` +
    `</w:footnotes>`
  );
}

const REL = (id: string, type: string, target: string) =>
  `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;

/** Builds the fixture; `document` swaps in another body for focused tests. */
export async function wordDocx(document?: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file("_rels/.rels", `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${REL("rId1", "officeDocument", "word/document.xml")}</Relationships>`);
  zip.file(
    "word/_rels/document.xml.rels",
    `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      REL("rId1", "styles", "styles.xml") +
      REL("rId2", "numbering", "numbering.xml") +
      REL("rId3", "settings", "settings.xml") +
      REL("rId4", "theme", "theme/theme1.xml") +
      REL("rId5", "footnotes", "footnotes.xml") +
      REL("rId10", "image", "media/image1.png") +
      REL("rId20", "header", "header1.xml") +
      REL("rId21", "footer", "footer1.xml") +
      `</Relationships>`,
  );
  zip.file("word/document.xml", document ?? documentXml());
  zip.file("word/styles.xml", stylesXml());
  zip.file("word/numbering.xml", numberingXml());
  zip.file("word/settings.xml", `${HEAD}<w:settings ${NS}><w:defaultTabStop w:val="708"/></w:settings>`);
  zip.file("word/theme/theme1.xml", THEME);
  zip.file("word/footnotes.xml", footnotesXml());
  zip.file("word/header1.xml", headerXml());
  zip.file("word/footer1.xml", footerXml());
  zip.file("word/media/image1.png", Buffer.from(LOGO, "base64"));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/** Wraps paragraphs in a minimal document body that uses the fixture's styles and numbering. */
export function bodyOnly(...paragraphs: string[]): string {
  return `${HEAD}<w:document ${NS}><w:body>${paragraphs.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

export { p as para, r as run };
