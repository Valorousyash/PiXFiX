const $ = (id) => document.getElementById(id);

const state = {
  file: null,
  originalUrl: null,
  currentBlob: null,
  currentUrl: null,
  originalWidth: 0,
  originalHeight: 0,
  quality: 0.75,
  resizeWidth: null,
  resizeHeight: null,
  aspectRatio: 1,
  lockRatio: true,
  selectedFormat: "image/jpeg",
  bulkFiles: [],
  cropData: null
};

const imageInput = $("imageInput");
const uploadCard = $("uploadCard");
const editor = $("editor");

$("browseBtn").addEventListener("click", () => imageInput.click());
$("replaceBtn").addEventListener("click", () => imageInput.click());

imageInput.addEventListener("change", async (e) => {
  if (e.target.files?.[0]) await loadFile(e.target.files[0]);
  e.target.value = "";
});

["dragenter", "dragover"].forEach(type => uploadCard.addEventListener(type, e => {
  e.preventDefault(); uploadCard.classList.add("dragover");
}));
["dragleave", "drop"].forEach(type => uploadCard.addEventListener(type, e => {
  e.preventDefault(); uploadCard.classList.remove("dragover");
}));
uploadCard.addEventListener("drop", async e => {
  const file = e.dataTransfer.files?.[0];
  if (file) await loadFile(file);
});

document.querySelectorAll(".tool-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tool-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".tool-panel").forEach(p => p.classList.add("hidden"));
    $(`${tab.dataset.tool}Panel`).classList.remove("hidden");
    if (tab.dataset.tool === "convert") updateConvertPreview();
    if (tab.dataset.tool === "exif") loadExifMetadata();
  });
});

$("qualityRange").addEventListener("input", e => {
  state.quality = Number(e.target.value) / 100;
  $("qualityValue").textContent = e.target.value;
  updateCompressionPreview();
});

$("widthInput").addEventListener("input", e => {
  if (state.lockRatio && e.target.value) {
    $("heightInput").value = Math.round(Number(e.target.value) / state.aspectRatio);
  }
});
$("heightInput").addEventListener("input", e => {
  if (state.lockRatio && e.target.value) {
    $("widthInput").value = Math.round(Number(e.target.value) * state.aspectRatio);
  }
});

$("lockRatio").addEventListener("click", () => {
  state.lockRatio = !state.lockRatio;
  $("lockRatio").classList.toggle("active", state.lockRatio);
});

$("applySizeBtn").addEventListener("click", () => {
  const w = parseInt($("widthInput").value, 10);
  const h = parseInt($("heightInput").value, 10);
  if (!w || !h || w < 1 || h < 1) return showMessage("Enter a valid width and height.");
  state.resizeWidth = w;
  state.resizeHeight = h;
  updateCompressionPreview();
  toast("Resize applied");
});

$("comparisonRange").addEventListener("input", e => setComparison(Number(e.target.value)));
$("cropBtn").addEventListener("click", openCropModal);

$("closeCropBtn").addEventListener("click", closeCropModal);
$("cancelCropBtn").addEventListener("click", closeCropModal);
$("applyCropBtn").addEventListener("click", applyCrop);

$("downloadCompressBtn").addEventListener("click", async () => {
  if (!state.currentBlob) await updateCompressionPreview();
  downloadBlob(state.currentBlob, makeName(".jpg"));
});

document.querySelectorAll(".format-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll(".format-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.selectedFormat = btn.dataset.format;
    $("convertQualityWrap").style.display = state.selectedFormat === "image/png" ? "none" : "block";
    $("gifHelper").textContent = state.selectedFormat === "image/gif"
      ? "GIF conversion creates a single-frame GIF from the selected image."
      : "The output is generated directly in your browser.";
    await updateConvertPreview();
  });
});

$("convertQuality").addEventListener("input", async e => {
  $("convertQualityValue").textContent = e.target.value;
  await updateConvertPreview();
});

$("downloadConvertBtn").addEventListener("click", async () => {
  try {
    const blob = await convertImage(state.file, state.selectedFormat, Number($("convertQuality").value) / 100);
    downloadBlob(blob, makeName(extensionForMime(state.selectedFormat)));
    toast("Converted image downloaded");
  } catch (err) {
    showMessage(err.message || "Conversion failed.");
  }
});

$("removeExifBtn").addEventListener("click", async () => {
  try {
    const mime = ["image/png", "image/webp", "image/gif"].includes(state.file.type) ? state.file.type : "image/jpeg";
    const blob = await renderToBlob(state.file, mime, 1, null, null);
    downloadBlob(blob, `${state.file.name.replace(/\.[^.]+$/, "")}-clean${extensionForMime(mime)}`);
    toast("Metadata removed and clean copy downloaded");
  } catch (err) {
    showMessage("Could not remove metadata from this image.");
  }
});

$("bulkChooseBtn").addEventListener("click", () => $("bulkInput").click());
$("bulkInput").addEventListener("change", e => {
  state.bulkFiles = [...(e.target.files || [])];
  renderBulkList();
});

$("bulkDownloadBtn").addEventListener("click", cleanBulk);

async function loadFile(file) {
  if (!file.type.startsWith("image/")) {
    showMessage("Please select an image file.");
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    showMessage("This project accepts files up to 50 MB.");
    return;
  }

  state.file = file;
  state.currentBlob = file;
  revokeUrls();
  state.originalUrl = URL.createObjectURL(file);
  state.currentUrl = state.originalUrl;

  const info = await getImageInfo(file);
  state.originalWidth = info.width;
  state.originalHeight = info.height;
  state.aspectRatio = info.width / info.height;
  state.resizeWidth = info.width;
  state.resizeHeight = info.height;

  $("fileName").textContent = file.name;
  $("fileInfo").textContent = `${info.width} × ${info.height} • ${formatBytes(file.size)}`;
  $("widthInput").value = info.width;
  $("heightInput").value = info.height;
  $("beforeSize").textContent = formatBytes(file.size);
  $("beforeImage").src = state.originalUrl;

  editor.classList.remove("hidden");
  uploadCard.classList.add("hidden");
  setComparison(50);
  await updateCompressionPreview();
  await updateConvertPreview();
  await loadExifMetadata();
  window.scrollTo({ top: editor.offsetTop - 20, behavior: "smooth" });
}

async function updateCompressionPreview() {
  if (!state.file) return;
  try {
    const blob = await renderToBlob(
      state.file,
      "image/jpeg",
      state.quality,
      state.resizeWidth,
      state.resizeHeight
    );
    state.currentBlob = blob;
    if (state.currentUrl !== state.originalUrl) URL.revokeObjectURL(state.currentUrl);
    state.currentUrl = URL.createObjectURL(blob);
    $("afterImage").src = state.currentUrl;
    $("afterSize").textContent = formatBytes(blob.size);
    setComparison(Number($("comparisonRange").value));
  } catch (err) {
    showMessage("Could not generate preview.");
  }
}

async function updateConvertPreview() {
  if (!state.file) return;
  try {
    const blob = await convertImage(state.file, state.selectedFormat, Number($("convertQuality").value) / 100);
    const url = URL.createObjectURL(blob);
    const old = $("convertPreview").dataset.url;
    if (old) URL.revokeObjectURL(old);
    $("convertPreview").dataset.url = url;
    $("convertPreview").src = url;
    $("convertMeta").textContent = `${formatBytes(blob.size)} • ${extensionForMime(state.selectedFormat).replace(".", "").toUpperCase()}`;
  } catch (err) {
    $("convertMeta").textContent = err.message || "Preview unavailable";
  }
}

function setComparison(percent) {
  percent = Math.max(0, Math.min(100, Number(percent) || 0));
  const afterLayer = $("afterLayer");
  // AFTER is a full-size layer. Only its visible area changes.
  // This prevents the image itself from shrinking when the handle moves.
  afterLayer.style.width = "100%";
  afterLayer.style.clipPath = `inset(0 0 0 ${percent}%)`;
  $("comparisonLine").style.left = `${percent}%`;
}

function renderToBlob(fileOrBlob, mime, quality, width, height) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fileOrBlob);
    const img = new Image();
    img.onload = () => {
      const targetW = width || img.naturalWidth;
      const targetH = height || img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d", { alpha: true });
      ctx.drawImage(img, 0, 0, targetW, targetH);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Browser could not encode this image.")), mime, quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image.")); };
    img.src = url;
  });
}

let gifWorkerUrlPromise = null;

async function getGifWorkerUrl() {
  if (gifWorkerUrlPromise) return gifWorkerUrlPromise;

  gifWorkerUrlPromise = fetch("https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js", { cache: "force-cache" })
    .then(response => {
      if (!response.ok) throw new Error("GIF worker could not be downloaded.");
      return response.blob();
    })
    .then(blob => URL.createObjectURL(blob))
    .catch(error => {
      gifWorkerUrlPromise = null;
      throw new Error("GIF conversion needs an internet connection to load its encoder. Please refresh the page and try again.");
    });

  return gifWorkerUrlPromise;
}

async function convertImage(file, mime, quality) {
  if (mime !== "image/gif") {
    return renderToBlob(file, mime, quality, null, null);
  }
  if (typeof GIF === "undefined") {
    throw new Error("GIF encoder could not be loaded. Please refresh the page and try again.");
  }

  const workerScript = await getGifWorkerUrl();
  const info = await getImageInfo(file);
  const canvas = document.createElement("canvas");
  canvas.width = info.width;
  canvas.height = info.height;
  const ctx = canvas.getContext("2d");
  const url = URL.createObjectURL(file);
  const img = new Image();

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error("Could not read the image for GIF conversion."));
    img.src = url;
  });

  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);

  return new Promise((resolve, reject) => {
    const gif = new GIF({
      workers: 2,
      workerScript,
      quality: Math.max(1, Math.round(30 - quality * 29)),
      width: canvas.width,
      height: canvas.height
    });

    gif.addFrame(canvas, { copy: true, delay: 500 });
    gif.on("finished", blob => resolve(blob));
    gif.on("error", error => reject(new Error("GIF encoding failed. Please try a smaller image.")));
    gif.render();
  });
}

function getImageInfo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Invalid image")); };
    img.src = url;
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function makeName(ext) {
  const base = (state.file?.name || "image").replace(/\.[^.]+$/, "");
  return `${base}-pixfix${ext}`;
}

function extensionForMime(mime) {
  return { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" }[mime] || ".jpg";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

function showMessage(message) {
  $("message").textContent = message;
}

let toastTimer;
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

function revokeUrls() {
  if (state.originalUrl) URL.revokeObjectURL(state.originalUrl);
  if (state.currentUrl && state.currentUrl !== state.originalUrl) URL.revokeObjectURL(state.currentUrl);
}

function renderBulkList() {
  $("bulkCount").textContent = `${state.bulkFiles.length} file${state.bulkFiles.length === 1 ? "" : "s"}`;
  $("bulkList").innerHTML = state.bulkFiles.map(file =>
    `<div class="bulk-item"><span>${escapeHtml(file.name)}</span><span>${formatBytes(file.size)}</span></div>`
  ).join("");
  $("bulkDownloadBtn").classList.toggle("hidden", state.bulkFiles.length === 0);
}

async function cleanBulk() {
  if (!state.bulkFiles.length) return;
  const button = $("bulkDownloadBtn");
  button.disabled = true;
  button.textContent = "Cleaning…";
  try {
    for (let i = 0; i < state.bulkFiles.length; i++) {
      const file = state.bulkFiles[i];
      const mime = ["image/png", "image/webp", "image/gif"].includes(file.type) ? file.type : "image/jpeg";
      const blob = await renderToBlob(file, mime, 1, null, null);
      downloadBlob(blob, `${file.name.replace(/\.[^.]+$/, "")}-clean${extensionForMime(mime)}`);
      await new Promise(r => setTimeout(r, 120));
    }
    toast(`${state.bulkFiles.length} cleaned file(s) downloaded`);
  } catch (err) {
    showMessage("One or more files could not be cleaned.");
  } finally {
    button.disabled = false;
    button.textContent = "Clean & download all";
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));
}

/* ---------------- EXIF metadata viewer ---------------- */

async function loadExifMetadata() {
  if (!state.file) return;
  const status = $("metadataStatus");
  const body = $("metadataTableBody");
  const empty = $("metadataEmpty");
  body.innerHTML = "";
  empty.classList.add("hidden");
  status.classList.remove("has-data");
  status.textContent = "Reading…";

  try {
    const parsed = await parseImageMetadata(state.file);
    const entries = metadataEntries(parsed);

    if (!entries.length) {
      status.textContent = "No metadata";
      empty.textContent = "No EXIF metadata was found in this image.";
      empty.classList.remove("hidden");
      return;
    }

    status.textContent = `${entries.length} fields found`;
    status.classList.add("has-data");
    body.innerHTML = entries.map(([key, value]) =>
      `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(value)}</td></tr>`
    ).join("");
  } catch (err) {
    status.textContent = "No metadata";
    empty.textContent = "No EXIF metadata was found in this image.";
    empty.classList.remove("hidden");
  }
}

/*
 * Small dependency-free EXIF reader.
 * It reads standard JPEG EXIF APP1 data and PNG/WebP EXIF chunks directly,
 * so the EXIF tab does not depend on a third-party metadata library loading.
 */
async function parseImageMetadata(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const tiff = extractExifTiff(bytes);
  if (!tiff) return {};
  return parseTiff(tiff);
}

function extractExifTiff(bytes) {
  // JPEG: APP1 -> Exif\0\0 -> TIFF
  if (bytes.length >= 4 && bytes[0] === 0xFF && bytes[1] === 0xD8) {
    let pos = 2;
    while (pos + 4 <= bytes.length) {
      if (bytes[pos] !== 0xFF) { pos++; continue; }
      while (pos < bytes.length && bytes[pos] === 0xFF) pos++;
      const marker = bytes[pos++];
      if (marker === 0xD9 || marker === 0xDA) break;
      if (pos + 2 > bytes.length) break;
      const len = (bytes[pos] << 8) | bytes[pos + 1];
      if (len < 2 || pos + len > bytes.length) break;
      if (marker === 0xE1 && len >= 8) {
        const start = pos + 2;
        if (ascii(bytes, start, 6) === "Exif\0\0") {
          return bytes.slice(start + 6);
        }
      }
      pos += len;
    }
    return null;
  }

  // PNG: eXIf chunk contains TIFF bytes.
  if (bytes.length >= 8 && ascii(bytes, 1, 3) === "PNG") {
    let pos = 8;
    while (pos + 12 <= bytes.length) {
      const len = readU32BE(bytes, pos);
      const type = ascii(bytes, pos + 4, 4);
      const dataStart = pos + 8;
      if (type === "eXIf") return bytes.slice(dataStart, dataStart + len);
      pos = dataStart + len + 4;
    }
    return null;
  }

  // WebP: RIFF/WEBP EXIF chunk.
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    let pos = 12;
    while (pos + 8 <= bytes.length) {
      const type = ascii(bytes, pos, 4);
      const len = readU32LE(bytes, pos + 4);
      const dataStart = pos + 8;
      if (type === "EXIF") return bytes.slice(dataStart, dataStart + len);
      pos = dataStart + len + (len % 2);
    }
  }
  return null;
}

function parseTiff(bytes) {
  if (bytes.length < 8) return {};
  const little = bytes[0] === 0x49 && bytes[1] === 0x49;
  if (!little && !(bytes[0] === 0x4D && bytes[1] === 0x4D)) return {};
  const u16 = o => readU16(bytes, o, little);
  const u32 = o => readU32(bytes, o, little);
  if (u16(2) !== 42) return {};

  const out = {};
  const visited = new Set();

  const typeSize = {1:1, 2:1, 3:2, 4:4, 5:8, 7:1, 9:4, 10:8};
  const tagNames = {
    0x010F: "Make", 0x0110: "Model", 0x0112: "Orientation", 0x0131: "Software",
    0x0132: "DateTime", 0x829A: "ExposureTime", 0x829D: "FNumber", 0x8827: "ISO",
    0x9207: "MeteringMode", 0x9208: "LightSource", 0x9209: "Flash", 0x920A: "FocalLength", 0xA403: "WhiteBalance",
    0x9003: "DateTimeOriginal", 0x9004: "CreateDate", 0xA001: "ColorSpace",
    0xA002: "PixelXDimension", 0xA003: "PixelYDimension", 0x0001: "GPSLatitudeRef",
    0x0002: "GPSLatitude", 0x0003: "GPSLongitudeRef", 0x0004: "GPSLongitude",
    0x0005: "GPSAltitudeRef", 0x0006: "GPSAltitude", 0x013B: "Artist",
    0x8298: "Copyright", 0x010E: "Description", 0x9286: "UserComment",
    0x0128: "ResolutionUnit", 0x011A: "XResolution", 0x011B: "YResolution"
  };

  function readIfd(offset, prefix="") {
    if (!Number.isFinite(offset) || offset < 0 || offset + 2 > bytes.length || visited.has(offset)) return;
    visited.add(offset);
    const count = u16(offset);
    let entryPos = offset + 2;
    for (let i = 0; i < count; i++) {
      if (entryPos + 12 > bytes.length) break;
      const tag = u16(entryPos);
      const type = u16(entryPos + 2);
      const n = u32(entryPos + 4);
      const size = typeSize[type];
      if (!size || n > 100000) { entryPos += 12; continue; }
      const total = size * n;
      const valueOffset = total <= 4 ? entryPos + 8 : u32(entryPos + 8);
      const name = tagNames[tag];
      let value;
      try { value = readValue(type, n, valueOffset); } catch { value = null; }
      if (name) out[prefix + name] = value;

      // EXIF SubIFD and GPSIFD pointers.
      if (tag === 0x8769 && value != null) readIfd(Number(value), "");
      if (tag === 0x8825 && value != null) readIfd(Number(value), "");
      entryPos += 12;
    }
  }

  function readValue(type, count, offset) {
    if (offset < 0 || offset >= bytes.length) return null;
    if (type === 2) return readAscii(offset, count);
    if (type === 1 || type === 7) {
      return count === 1 ? bytes[offset] : Array.from(bytes.slice(offset, Math.min(bytes.length, offset + count)));
    }
    if (type === 3) {
      const a = Array.from({length: count}, (_, i) => u16(offset + i * 2));
      return count === 1 ? a[0] : a;
    }
    if (type === 4) {
      const a = Array.from({length: count}, (_, i) => u32(offset + i * 4));
      return count === 1 ? a[0] : a;
    }
    if (type === 5 || type === 10) {
      const signed = type === 10;
      const a = [];
      for (let i = 0; i < count; i++) {
        const p = offset + i * 8;
        const num = signed ? readI32(bytes, p, little) : u32(p);
        const den = signed ? readI32(bytes, p + 4, little) : u32(p + 4);
        if (!den) a.push(null); else a.push(num / den);
      }
      return count === 1 ? a[0] : a;
    }
    return null;
  }

  readIfd(u32(4));
  return out;
}

function metadataEntries(data) {
  const fields = [
    ["Camera Make", "Make"], ["Camera Model", "Model"], ["Date Taken", "DateTimeOriginal"],
    ["Software", "Software"], ["Orientation", "Orientation"], ["Exposure Time", "ExposureTime"],
    ["F Number", "FNumber"], ["ISO", "ISO"], ["Focal Length", "FocalLength"],
    ["Flash", "Flash"], ["Metering Mode", "MeteringMode"], ["White Balance", "WhiteBalance"],
    ["Color Space", "ColorSpace"], ["Image Width", "PixelXDimension"], ["Image Height", "PixelYDimension"],
    ["GPS Latitude", "GPSLatitude"], ["GPS Longitude", "GPSLongitude"], ["GPS Altitude", "GPSAltitude"],
    ["Artist", "Artist"], ["Copyright", "Copyright"], ["Description", "Description"],
    ["User Comment", "UserComment"], ["X Resolution", "XResolution"], ["Y Resolution", "YResolution"],
    ["Resolution Unit", "ResolutionUnit"]
  ];

  return fields
    .filter(([, key]) => Object.prototype.hasOwnProperty.call(data, key))
    .map(([label, key]) => [label, formatMetadataField(key, data[key], data)]);
}

function formatMetadataField(key, value, data = {}) {
  try {
    if (value === null || value === undefined || value === "") return "-";
    if (key === "GPSLatitude" || key === "GPSLongitude") {
      if (!Array.isArray(value) || value.length < 3 || value.some(v => !Number.isFinite(v))) return "-";
      const d = value[0], m = value[1], s = value[2];
      if (d < 0 || m < 0 || s < 0 || m >= 60 || s >= 60) return "-";
      const refValue = key === "GPSLatitude" ? data.GPSLatitudeRef : data.GPSLongitudeRef;
      const ref = typeof refValue === "string" ? refValue.trim().toUpperCase() : "";
      const validRef = key === "GPSLatitude" ? ["N", "S"].includes(ref) : ["E", "W"].includes(ref);
      return `${d.toFixed(6)}°${validRef ? ` ${ref}` : ""}`;
    }
    if (key === "GPSAltitude") {
      return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} m` : "-";
    }
    if (key === "ExposureTime") {
      const n = Number(value); if (!Number.isFinite(n) || n <= 0) return "-";
      return n >= 1 ? `${n.toFixed(3)} s` : `1/${Math.round(1/n)} s`;
    }
    if (key === "FNumber") {
      const n = Number(value); return Number.isFinite(n) && n > 0 ? `f/${n.toFixed(1)}` : "-";
    }
    if (key === "FocalLength") {
      const n = Number(value); return Number.isFinite(n) && n > 0 ? `${n.toFixed(1)} mm` : "-";
    }
    if (["XResolution", "YResolution"].includes(key)) {
      const n = Number(value); return Number.isFinite(n) && n > 0 ? String(Number(n.toFixed(2))) : "-";
    }
    if (["PixelXDimension", "PixelYDimension", "ISO", "Orientation", "ResolutionUnit", "ColorSpace", "Flash", "MeteringMode"].includes(key)) {
      const n = Number(value); return Number.isFinite(n) ? String(n) : "-";
    }
    if (key === "DateTimeOriginal" || key === "CreateDate" || key === "DateTime") {
      const str = String(value).trim();
      return /^\d{4}[:\-]\d{2}[:\-]\d{2}(?:[ T]\d{2}:\d{2}:\d{2})?$/.test(str) ? str : "-";
    }
    if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
    const str = String(value).replace(/[\x00-\x1F\x7F]/g, " ").trim();
    return str || "-";
  } catch { return "-"; }

}

function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}
function readAscii(bytes, start, length) {
  return ascii(bytes, start, length).replace(/\0+$/, "").trim();
}
function readU16(bytes, o, little) {
  if (o + 2 > bytes.length) throw new Error("Out of range");
  return little ? bytes[o] | (bytes[o + 1] << 8) : (bytes[o] << 8) | bytes[o + 1];
}
function readU32(bytes, o, little) {
  if (o + 4 > bytes.length) throw new Error("Out of range");
  return little ? (bytes[o] | (bytes[o+1]<<8) | (bytes[o+2]<<16) | (bytes[o+3]*0x1000000)) >>> 0
                : ((bytes[o]*0x1000000) + (bytes[o+1]<<16) + (bytes[o+2]<<8) + bytes[o+3]) >>> 0;
}
function readI32(bytes, o, little) {
  const n = readU32(bytes, o, little);
  return n > 0x7FFFFFFF ? n - 0x100000000 : n;
}
function readU32BE(bytes, o) { return readU32(bytes, o, false); }
function readU32LE(bytes, o) { return readU32(bytes, o, true); }

/* ---------------- Cropper: lightweight custom crop tool ---------------- */

function openCropModal() {
  if (!state.file) return;
  $("cropImage").src = state.originalUrl;
  $("cropModal").classList.remove("hidden");
  requestAnimationFrame(() => initCropBox());
}

function closeCropModal() {
  $("cropModal").classList.add("hidden");
}

function initCropBox() {
  const stage = $("cropStage");
  const image = $("cropImage");
  const box = $("cropBox");
  const sr = stage.getBoundingClientRect();
  const ir = image.getBoundingClientRect();
  const left = ir.left - sr.left + ir.width * .12;
  const top = ir.top - sr.top + ir.height * .12;
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.width = `${ir.width * .76}px`;
  box.style.height = `${ir.height * .76}px`;
  state.cropData = { dragging: false };
  attachCropHandlers();
}

let cropHandlersAttached = false;
function attachCropHandlers() {
  if (cropHandlersAttached) return;
  cropHandlersAttached = true;
  const stage = $("cropStage");
  const box = $("cropBox");
  let mode = null, startX = 0, startY = 0, start = null;

  stage.addEventListener("pointerdown", e => {
    if (!box.contains(e.target) && e.target !== $("cropImage")) return;
    e.preventDefault();
    const handle = e.target.closest(".crop-handle");
    mode = handle ? handle.classList[1] : "move";
    const br = box.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    start = { left: br.left-sr.left, top: br.top-sr.top, width: br.width, height: br.height };
    stage.setPointerCapture(e.pointerId);
  });

  stage.addEventListener("pointermove", e => {
    if (!mode || !start) return;
    const sr = stage.getBoundingClientRect();
    const dx = e.clientX - startX, dy = e.clientY - startY;
    const min = 35;
    let left = start.left, top = start.top, width = start.width, height = start.height;

    if (mode === "move") { left += dx; top += dy; }
    if (mode.includes("e")) width += dx;
    if (mode.includes("s")) height += dy;
    if (mode.includes("w")) { left += dx; width -= dx; }
    if (mode.includes("n")) { top += dy; height -= dy; }

    left = Math.max(0, left); top = Math.max(0, top);
    width = Math.max(min, width); height = Math.max(min, height);
    if (left + width > sr.width) width = sr.width - left;
    if (top + height > sr.height) height = sr.height - top;

    box.style.left = `${left}px`; box.style.top = `${top}px`;
    box.style.width = `${width}px`; box.style.height = `${height}px`;
  });

  stage.addEventListener("pointerup", () => { mode = null; start = null; });
  stage.addEventListener("pointercancel", () => { mode = null; start = null; });
}

async function applyCrop() {
  const stage = $("cropStage"), box = $("cropBox"), img = $("cropImage");
  const sr = stage.getBoundingClientRect(), ir = img.getBoundingClientRect(), br = box.getBoundingClientRect();

  const scaleX = img.naturalWidth / ir.width;
  const scaleY = img.naturalHeight / ir.height;
  const x = Math.max(0, (br.left - ir.left) * scaleX);
  const y = Math.max(0, (br.top - ir.top) * scaleY);
  const w = Math.min(img.naturalWidth - x, br.width * scaleX);
  const h = Math.min(img.naturalHeight - y, br.height * scaleY);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w); canvas.height = Math.round(h);
  canvas.getContext("2d").drawImage(img, x, y, w, h, 0, 0, w, h);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png", 1));
  if (!blob) return;
  const croppedFile = new File([blob], `${state.file.name.replace(/\.[^.]+$/, "")}-cropped.png`, { type: "image/png" });
  closeCropModal();
  await loadFile(croppedFile);
  toast("Crop applied");
}
