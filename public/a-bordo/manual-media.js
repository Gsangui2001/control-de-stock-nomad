"use strict";

class BoatManualMedia extends HTMLElement {
  connectedCallback() {
    this.load();
  }

  disconnectedCallback() {
    this.request?.abort();
    this.clearMedia();
  }

  clearMedia() {
    this.querySelectorAll("video").forEach(video => video.pause());
    for (const url of this.localUrls || []) URL.revokeObjectURL(url);
    this.localUrls = [];
    this.querySelector("dialog")?.close();
  }

  async load() {
    this.request?.abort();
    this.clearMedia();
    const request = new AbortController();
    const owner = boatId;
    this.request = request;
    this.replaceChildren();

    const heading = document.createElement("h2");
    heading.textContent = "Fotos y videos del barco";
    const message = document.createElement("p");
    message.className = "day-muted";
    message.setAttribute("role", "status");
    message.textContent = "Buscando los recorridos…";
    this.append(heading, message);

    const active = () => !request.signal.aborted && this.isConnected && owner === boatId;
    const local = boatLocalManual.available(owner);
    if (local) {
      const items = await boatLocalManual.read(owner).catch(() => null);
      if (!active()) return;
      if (items?.length) {
        message.textContent = "Guardado en este dispositivo.";
        const localUrl = blob => {
          const url = URL.createObjectURL(blob);
          this.localUrls.push(url);
          return url;
        };
        for (const item of items) {
          this.append(this.card(item, localUrl(item.video), item.photos.map(photo => ({
            url: localUrl(photo.blob), caption: photo.caption
          }))));
        }
        return;
      }
    }
    try {
      const response = await fetch("/api/boat/manual-media?" + new URLSearchParams({boat: owner}), {
        cache: "no-store", credentials: "same-origin", signal: request.signal
      });
      if (response.status === 401 || response.status === 403) {
        if (active()) this.replaceChildren();
        return;
      }
      if (!response.ok) throw Error();
      const {items} = await response.json();
      if (request.signal.aborted || !this.isConnected || owner !== boatId) return;
      if (!Array.isArray(items)) throw Error();
      if (!items.length) {
        if (local) {
          message.remove();
          this.append(this.filePicker(owner, request.signal));
        } else {
          this.replaceChildren();
        }
        return;
      }
      const cards = items.map(item => this.card(item,
        this.assetUrl(owner, item.id, "video", item.videoUrl),
        item.photos.map((photo, index) => ({
          url: this.assetUrl(owner, item.id, "photo-" + (index + 1), photo.url),
          caption: photo.caption || item.title
        }))));
      message.remove();
      this.append(...cards);
      if (local) {
        const offline = document.createElement("details");
        offline.className = "day-disclosure";
        const label = document.createElement("summary");
        label.textContent = "Usar una copia en este dispositivo";
        offline.append(label, this.filePicker(owner, request.signal));
        this.append(offline);
      }
    } catch {
      if (request.signal.aborted || !this.isConnected || owner !== boatId) return;
      message.textContent = "No se pudieron cargar las fotos y los videos.";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "day-secondary";
      retry.textContent = "Volver a intentar";
      retry.onclick = () => this.load();
      this.append(retry);
      if (local) this.append(this.filePicker(owner, request.signal));
    }
  }

  filePicker(owner, signal) {
    const container = document.createElement("div");
    const status = document.createElement("p");
    status.className = "day-muted";
    status.setAttribute("role", "status");
    status.textContent = "Elegí Manual-Nomade-para-celular.zip una vez. Las fotos y los videos quedan guardados acá para verlos dentro de A bordo.";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,application/zip,application/x-zip-compressed";
    input.hidden = true;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-secondary";
    button.textContent = "Elegir el manual";
    button.onclick = () => input.click();
    input.onchange = async () => {
      const file = input.files[0];
      if (!file || signal.aborted) return;
      button.disabled = true;
      status.textContent = "Preparando fotos y videos…";
      try {
        await boatLocalManual.save(owner, file, signal);
        if (!signal.aborted) this.load();
      } catch (error) {
        if (signal.aborted) return;
        if (error.name === "QuotaExceededError") {
          status.textContent = "Falta espacio en este dispositivo. Liberá espacio y volvé a elegir el archivo.";
        } else {
          status.textContent = error.message.startsWith("Elegí") ? error.message :
            "No se pudo guardar el manual en este navegador. Revisá los permisos de almacenamiento y volvé a intentarlo.";
        }
        input.value = "";
        button.disabled = false;
      }
    };
    container.append(status, button, input);
    return container;
  }

  assetUrl(owner, item, asset, rawUrl) {
    const url = new URL(rawUrl, location.origin);
    if (url.origin !== location.origin || url.pathname !== "/api/boat/manual-media" ||
        url.searchParams.get("boat") !== owner || url.searchParams.get("item") !== item ||
        url.searchParams.get("asset") !== asset) throw Error();
    return url.href;
  }

  showPhoto(photo) {
    const dialog = document.createElement("dialog");
    dialog.className = "manual-photo-dialog";
    dialog.setAttribute("aria-label", photo.caption);
    const image = document.createElement("img");
    image.src = photo.url;
    image.alt = photo.caption;
    const caption = document.createElement("p");
    caption.textContent = photo.caption;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "day-secondary";
    close.textContent = "Cerrar foto";
    close.onclick = () => dialog.close();
    dialog.onclose = () => dialog.remove();
    dialog.append(close, image, caption);
    this.append(dialog);
    dialog.showModal();
  }

  card(item, videoUrl, photos) {
    const card = document.createElement("details");
    card.className = "day-disclosure manual-media-card";
    const summary = document.createElement("summary");
    summary.textContent = item.title;
    if (item.area) {
      const area = document.createElement("small");
      area.textContent = item.area;
      summary.append(area);
    }
    card.append(summary);

    card.addEventListener("toggle", () => {
      if (!card.open) {
        card.querySelector("video")?.pause();
        return;
      }
      for (const other of this.querySelectorAll(".manual-media-card[open]")) {
        if (other !== card) other.open = false;
      }
      if (card.querySelector("video")) return;

      if (item.description) {
        const notes = document.createElement("p");
        notes.textContent = item.description;
        card.append(notes);
      }
      const video = document.createElement("video");
      video.controls = true;
      video.playsInline = true;
      video.preload = "none";
      video.setAttribute("aria-label", "Video de " + item.title);
      if (photos.length) video.poster = photos[0].url;
      video.src = videoUrl;
      card.append(video);
      video.addEventListener("error", () => {
        if (!card.isConnected || card.querySelector(".manual-video-error")) return;
        const recovery = document.createElement("div");
        recovery.className = "manual-video-error";
        recovery.setAttribute("role", "status");
        const note = document.createElement("p");
        note.textContent = "No se pudo reproducir el video.";
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "day-secondary";
        retry.textContent = "Reintentar video";
        retry.onclick = () => {
          recovery.remove();
          video.load();
          video.play().catch(() => {});
        };
        recovery.append(note, retry);
        video.after(recovery);
      });

      const gallery = document.createElement("div");
      gallery.className = "manual-media-photos";
      for (const photo of photos) {
        const figure = document.createElement("figure");
        const link = document.createElement("button");
        link.type = "button";
        link.onclick = () => this.showPhoto(photo);
        link.setAttribute("aria-label", "Ampliar foto: " + photo.caption);
        const image = document.createElement("img");
        image.loading = "lazy";
        image.alt = photo.caption;
        image.src = photo.url;
        const caption = document.createElement("figcaption");
        caption.textContent = photo.caption;
        image.onerror = () => {
          if (figure.querySelector(".manual-photo-retry")) return;
          const retry = document.createElement("button");
          retry.type = "button";
          retry.className = "day-secondary manual-photo-retry";
          retry.textContent = "Volver a cargar la foto";
          retry.onclick = () => {
            retry.remove();
            image.src = photo.url;
          };
          figure.append(retry);
        };
        link.append(image);
        figure.append(link, caption);
        gallery.append(figure);
      }
      card.append(gallery);
    });
    return card;
  }
}

customElements.define("boat-manual-media", BoatManualMedia);
