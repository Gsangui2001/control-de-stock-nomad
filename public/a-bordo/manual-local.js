"use strict";

// The portable manual is a single known, uncompressed ZIP. Read its entries in
// memory so the user's file and the resulting media never leave this device.
const boatLocalManual = (() => {
  const nomadeId = "6bf8e2dceb8157d62159ae7bd29967fd";
  const packageBytes = 68401997;
  const packageHash = "e38951962c6b292ea40d3ca8fa6851bee702b210a4a12be607f0288150db36a7";

  function available(owner) {
    return owner === nomadeId && boatId === owner && Boolean(session?.id && state) &&
      boats.some(boat => boat.id === owner);
  }

  function stored(owner, mode, operation) {
    return new Promise((resolve, reject) => {
      if (!available(owner)) return reject(Error("Acceso al barco requerido."));
      const open = indexedDB.open("a-bordo-manual", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("manuales");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("manuales", mode);
        db.close();
        const result = operation(tx.objectStore("manuales"));
        tx.oncomplete = () => resolve(result.result);
        tx.onabort = () => reject(tx.error || Error("Almacenamiento interrumpido."));
      };
    });
  }

  async function unpack(file) {
    const wrongFile = "Elegí el archivo original Manual-Nomade-para-celular.zip.";
    if (file.size !== packageBytes) throw Error(wrongFile);
    const buffer = await file.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    const hex = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
    if (hex !== packageHash) throw Error(wrongFile);

    const header = new DataView(buffer);
    const decoder = new TextDecoder();
    const groups = new Map();
    let index = "";
    let offset = 0;
    while (header.getUint32(offset, true) === 0x04034b50) {
      const size = header.getUint32(offset + 18, true);
      const nameSize = header.getUint16(offset + 26, true);
      const extraSize = header.getUint16(offset + 28, true);
      const name = decoder.decode(new Uint8Array(buffer, offset + 30, nameSize));
      const start = offset + 30 + nameSize + extraSize;
      const bytes = new Uint8Array(buffer, start, size);
      offset = start + size;
      const [folder, filename] = name.split("/");
      if (!filename) {
        index = decoder.decode(bytes).replace(/\r/g, "");
        continue;
      }
      if (!groups.has(folder)) groups.set(folder, {title: folder.slice(5), photos: []});
      const item = groups.get(folder);
      if (filename.endsWith(".mp4")) item.video = new Blob([bytes], {type: "video/mp4"});
      else {
        const caption = filename.replace(/^Foto \d+ - /, "").replace(/\.jpg$/, "");
        item.photos.push({caption, blob: new Blob([bytes], {type: "image/jpeg"})});
      }
    }
    const lines = index.split("\n");
    for (const [folder, item] of groups) {
      const line = lines.findIndex(text => text.startsWith(folder + " ("));
      if (line !== -1) item.description = lines[line + 1];
    }
    return Array.from(groups.values());
  }

  return {
    available,
    read: owner => stored(owner, "readonly", store => store.get(owner)),
    async save(owner, file, signal) {
      const items = await unpack(file);
      if (signal.aborted) return;
      await stored(owner, "readwrite", store => store.put(items, owner));
    }
  };
})();
