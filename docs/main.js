const mapBg = document.getElementById('map-bg');
const mapOut = document.getElementById('map-output');
const brushSizeOut = document.getElementById('brush-size');
const centerX = document.getElementById('center-x');
const centerZ = document.getElementById('center-z');

const mapCtx = mapOut.getContext('2d');

const MAP_SIZE = 128;
const isWaterBuf = new Uint8Array(MAP_SIZE * MAP_SIZE);
const mapColorIndexBuf = new Uint8Array(MAP_SIZE * MAP_SIZE);
const mapRgbBuf = new Uint8ClampedArray(MAP_SIZE * MAP_SIZE * 4);

const maskCanvas = document.createElement('canvas');
maskCanvas.width = MAP_SIZE;
maskCanvas.height = MAP_SIZE;
const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

const downloadLink = document.createElement('a');
document.body.appendChild(downloadLink);

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'image/*';
const imageLoader = new Image();
window.imageLoader = imageLoader;

let isDrawing = false;
let prevDrawPos = null;
let brushR = 2;

function getMapPos(e) {
  const rect = mapOut.getBoundingClientRect();
  return [
    Math.floor((e.clientX - rect.left) * MAP_SIZE / rect.width),
    Math.floor((e.clientY - rect.top) * MAP_SIZE / rect.height),
  ];
}

function plotLine(x0, y0, x1, y1, callback) {
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  
  for (;;) {
    callback(x0, y0);
    const e2 = 2 * error;
    if (e2 >= dy) {
      if (x0 == x1) break;
      error += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      if (y0 == y1) break;
      error += dx;
      y0 += sy;
    }
  }
}

function drawWater(e) {
  const pos = getMapPos(e);
  const isWater = !e.shiftKey;

  if (imageLoader.src !== '') {
    // Cancel load
    imageLoader.src = '';
  }

  plotLine(...(prevDrawPos ?? pos), ...pos, (x, y) => {
    const minX = Math.max(x - brushR, 0);
    const minY = Math.max(y - brushR, 0);
    const maxX = Math.min(x + 1 + brushR, MAP_SIZE);
    const maxY = Math.min(y + 1 + brushR, MAP_SIZE);

    for (let iy = minY; iy < maxY; iy++) {
      for (let ix = minX; ix < maxX; ix++) {
        const dx = x - ix;
        const dy = y - iy;
        if (dx*dx + dy*dy <= brushR*brushR) {
          isWaterBuf[iy * MAP_SIZE + ix] = isWater;
        }
      }
    }
  });

  updateMap();
  
  prevDrawPos = pos;
}

mapBg.addEventListener('mousedown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.button !== 0) return;

  isDrawing = true;
  prevDrawPos = null;

  drawWater(e);

  e.preventDefault();
});

window.addEventListener('mousemove', e => {
  if (!isDrawing) return;

  if (e.buttons & 1) {
    drawWater(e);
  } else {
    isDrawing = false;
    prevDrawPos = null;
  }
});

window.addEventListener('mouseup', e => {
  if (e.button !== 0 || !isDrawing) return;

  isDrawing = false;
  prevDrawPos = null;

  e.preventDefault();
});

window.addEventListener('mouseleave', e => {
  prevDrawPos = null;
});

brushSizeOut.innerText = 1 + 2 * brushR;
mapBg.addEventListener('wheel', e => {
  if (e.deltaY < 0) brushR = Math.min(brushR + 1, 22);
  if (e.deltaY > 0) brushR = Math.max(brushR - 1, 0);
  brushSizeOut.innerText = 1 + 2 * brushR;
});

function updateMap() {
  for (let mx = 1; mx < MAP_SIZE - 1; mx++) {
    for (let mz = 1; mz < MAP_SIZE - 1; mz++) {

      let waterCount = 0;
      for (let dx = -1; dx < 2; dx++) {
        for (let dz = -1; dz < 2; dz++) {
          if ((dx != 0 || dz != 0) && isWaterBuf[(mz + dz) * MAP_SIZE + mx + dx]) {
            waterCount++;
          }
        }
      }

      let brightness = 3; // LOWEST
      let newColor = 0; // NONE
      if (isWaterBuf[mz * MAP_SIZE + mx]) {
        newColor = 15; // ORANGE
        if (waterCount > 7 && mz % 2 == 0) {
          switch (Math.trunc((mx + Math.trunc(Math.sin(mz) * 7.0)) / 8) % 5) {
          case 0:
          case 4:
            brightness = 0; // LOW
            break;
          case 1:
          case 3:
            brightness = 1; // NORMAL
            break;
          case 2:
            brightness = 2; // HIGH
          }
        } else if (waterCount > 7) {
          newColor = 0; // NONE
        } else if (waterCount > 5) {
          brightness = 1; // NORMAL
        } else if (waterCount > 3) {
          brightness = 0; // LOW
        } else if (waterCount > 1) {
          brightness = 0; // LOW
        }
      } else if (waterCount > 0) {
        newColor = 26; // BROWN
        if (waterCount > 3) {
          brightness = 1; // NORMAL
        } else {
          brightness = 3; // LOWEST
        }
      }

      const rgbIndex = mz * MAP_SIZE * 4 + mx * 4;
      if (newColor !== 0) {
        const mult = brightnessScales[brightness];
        let [r, g, b] = baseColors[newColor];
        mapRgbBuf[rgbIndex + 0] = r * mult / 255;
        mapRgbBuf[rgbIndex + 1] = g * mult / 255;
        mapRgbBuf[rgbIndex + 2] = b * mult / 255;
        mapRgbBuf[rgbIndex + 3] = 255;
        mapColorIndexBuf[mz * MAP_SIZE + mx] = (newColor << 2) | (brightness & 3);
      } else {
        mapRgbBuf[rgbIndex + 0] = 0;
        mapRgbBuf[rgbIndex + 1] = 0;
        mapRgbBuf[rgbIndex + 2] = 0;
        mapRgbBuf[rgbIndex + 3] = 0;
        mapColorIndexBuf[mz * MAP_SIZE + mx] = 0;
      }
    }
  }

  const imgData = new ImageData(mapRgbBuf, MAP_SIZE, MAP_SIZE);
  mapCtx.putImageData(imgData, 0, 0, 1, 1, MAP_SIZE - 2, MAP_SIZE - 2);
}

document.getElementById('invert-water').addEventListener('click', e => {
  if (e.button !== 0) return;
  for (let i = 0; i < isWaterBuf.length; i++) {
    isWaterBuf[i] = !isWaterBuf[i];
  }
  updateMap();
});

document.getElementById('load-water').addEventListener('click', e => {
  if (e.button !== 0) return;
  fileInput.click();
});

document.getElementById('save-water').addEventListener('click', e => {
  if (e.button !== 0) return;
  for (let i = 0; i < isWaterBuf.length; i++) {
    const lumen = isWaterBuf[i] ? 0 : 255;
    mapRgbBuf[i * 4 + 0] = lumen;
    mapRgbBuf[i * 4 + 1] = lumen;
    mapRgbBuf[i * 4 + 2] = lumen;
    mapRgbBuf[i * 4 + 3] = 255;
  }
  const imgData = new ImageData(mapRgbBuf, MAP_SIZE, MAP_SIZE);
  maskCtx.putImageData(imgData, 0, 0);
  maskCanvas.toBlob(blob => {
    if (!blob) {
      alert('ERROR: Could not convert mask to PNG');
      return;
    }

    const url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.download = 'water-mask.png';
    downloadLink.click();
    URL.revokeObjectURL(url);

  }, 'image/png');
});

function nbtTag(id, name, payloadSize, encode) {
  const bytes = new Uint8Array(3 + name.length + payloadSize);
  bytes[0] = id;
  const dv = new DataView(bytes.buffer);
  dv.setUint16(1, name.length);
  new TextEncoder().encodeInto(name, bytes.subarray(3));
  if (encode) encode(dv, 3 + name.length);
  return bytes;
}

function nbtByte(name, value) {
  return nbtTag(1, name, 1, (dv, i) => dv.setInt8(i, value));
}

function nbtInt(name, value) {
  return nbtTag(3, name, 4, (dv, i) => dv.setInt32(i, value));
}

function nbtByteArray(name, size) {
  return nbtTag(7, name, 4, (dv, i) => dv.setInt32(i, size));
}

function nbtCompound(name) {
  return nbtTag(10, name, 0);
}

const NBT_END = new Uint8Array(1);

const saveNbt = document.getElementById('save-nbt');
saveNbt.addEventListener('click', async e => {
  if (e.button !== 0) return;

  saveNbt.disabled = true;

  try {
    const stream = new ReadableStream({ start: controller => {
      controller.enqueue(nbtCompound(''));
      controller.enqueue(nbtCompound('data'));
      controller.enqueue(nbtInt('xCenter', parseInt(centerX.value)));
      controller.enqueue(nbtInt('zCenter', parseInt(centerZ.value)));
      controller.enqueue(nbtByte('dimension', 0));
      controller.enqueue(nbtByte('scale', 1));
      controller.enqueue(nbtByte('unlimitedTracking', 1));
      controller.enqueue(nbtByteArray('colors', mapColorIndexBuf.length));
      controller.enqueue(mapColorIndexBuf);
      controller.enqueue(NBT_END);
      controller.enqueue(NBT_END);
      controller.close();
    } }).pipeThrough(new CompressionStream("gzip"));
    const nbt = await new Response(stream).blob();

    const url = URL.createObjectURL(nbt);
    downloadLink.href = url;
    downloadLink.download = 'map_N.dat';
    downloadLink.click();
    URL.revokeObjectURL(url);

  } catch (e) {
    alert('ERROR: Could not save NBT - ' + e.message);
    console.error('Failed to save NBT', e);
  } finally {
    saveNbt.disabled = false;
  }
});

fileInput.addEventListener('change', async e => {
  if (fileInput.files.length === 0) return;
  const url = URL.createObjectURL(fileInput.files[0]);
  fileInput.value = null;
  try {
    imageLoader.src = '';
    imageLoader.src = url;
    await imageLoader.decode();

    maskCtx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    maskCtx.drawImage(imageLoader,
      0, 0, imageLoader.naturalWidth, imageLoader.naturalHeight,
      0, 0, MAP_SIZE, MAP_SIZE);
    const imgData = maskCtx.getImageData(0, 0, MAP_SIZE, MAP_SIZE, {
      colorSpace: 'srgb',
      pixelFormat: 'rgba-unorm8',
    }).data;

    for (let i = 0; i < isWaterBuf.length; i++) {
      const a = imgData[i * 4 + 3];
      if (a < 5) {
        isWaterBuf[i] = false;
      } else {
        const r = imgData[i * 4 + 0];
        const g = imgData[i * 4 + 1];
        const b = imgData[i * 4 + 2];
        const avg = (r + g + b) / 3;
        isWaterBuf[i] = avg < 127;
      }
    }

    updateMap();

  } catch (e) {
    if (imageLoader.src !== url) return;
    alert('ERROR: Could not load water mask - ' + e.message);
    console.error('Could not load water mask', e);
  } finally {
    URL.revokeObjectURL(url);
  }
});

const brightnessScales = [180, 220, 255, 135];
const baseColors = [
  [NaN, NaN, NaN],
  [0x7f, 0xb2, 0x38],
  [0xf7, 0xe9, 0xa3],
  [0xc7, 0xc7, 0xc7],
  [0xff, 0x00, 0x00],
  [0xa0, 0xa0, 0xff],
  [0xa7, 0xa7, 0xa7],
  [0x00, 0x7c, 0x00],
  [0xff, 0xff, 0xff],
  [0xa4, 0xa8, 0xb8],
  [0x97, 0x6d, 0x4d],
  [0x70, 0x70, 0x70],
  [0x40, 0x40, 0xff],
  [0x8f, 0x77, 0x48],
  [0xff, 0xfc, 0xf5],
  [0xd8, 0x7f, 0x33],
  [0xb2, 0x4c, 0xd8],
  [0x66, 0x99, 0xd8],
  [0xe5, 0xe5, 0x33],
  [0x7f, 0xcc, 0x19],
  [0xf2, 0x7f, 0xa5],
  [0x4c, 0x4c, 0x4c],
  [0x99, 0x99, 0x99],
  [0x4c, 0x7f, 0x99],
  [0x7f, 0x3f, 0xb2],
  [0x33, 0x4c, 0xb2],
  [0x66, 0x4c, 0x33],
  [0x66, 0x7f, 0x33],
  [0x99, 0x33, 0x33],
  [0x19, 0x19, 0x19],
  [0xfa, 0xee, 0x4d],
  [0x5c, 0xdb, 0xd5],
  [0x4a, 0x80, 0xff],
  [0x00, 0xd9, 0x3a],
  [0x81, 0x56, 0x31],
  [0x70, 0x02, 0x00],
  [0xd1, 0xb1, 0xa1],
  [0x9f, 0x52, 0x24],
  [0x95, 0x57, 0x6c],
  [0x70, 0x6c, 0x8a],
  [0xba, 0x85, 0x24],
  [0x67, 0x75, 0x35],
  [0xa0, 0x4d, 0x4e],
  [0x39, 0x29, 0x23],
  [0x87, 0x6b, 0x62],
  [0x57, 0x5c, 0x5c],
  [0x7a, 0x49, 0x58],
  [0x4c, 0x3e, 0x5c],
  [0x4c, 0x32, 0x23],
  [0x4c, 0x52, 0x2a],
  [0x8e, 0x3c, 0x2e],
  [0x25, 0x16, 0x10],
  [0xbd, 0x30, 0x31],
  [0x94, 0x3f, 0x61],
  [0x5c, 0x19, 0x1d],
  [0x16, 0x7e, 0x86],
  [0x3a, 0x8e, 0x8c],
  [0x56, 0x2c, 0x3e],
  [0x14, 0xb4, 0x85],
  [0x64, 0x64, 0x64],
  [0xd8, 0xaf, 0x93],
  [0x7f, 0xa7, 0x96],
];
