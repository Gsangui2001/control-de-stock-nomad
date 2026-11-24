"use strict";

class BoatManualMedia extends HTMLElement {
  connectedCallback() {
    this.load();
  }

  disconnectedCallback() {
    this.request?.abort();
    this.querySelectorAll("video").forEach(video => video.pause());
  }

  async load() {
    this.request?.abort();
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

    try {
      const response = await fetch("/api/boat/manual-media?" + new URLSearchParams({boat: owner}), {
        cache: "no-store", credentials: "same-origin", signal: request.signal
      });
      if (!response.ok) throw Error();
      const {items} = await response.json();
      if (request.signal.aborted || !this.isConnected || owner !== boatId) return;
      if (!Array.isArray(items)) throw Error();
      if (!items.length) {
        this.replaceChildren();
        return;
      }
      const cards = items.map(item => this.card(owner, item));
      message.remove();
      this.append(...cards);
    } catch {
      if (request.signal.aborted || !this.isConnected || owner !== boatId) return;
      message.textContent = "No se pudieron cargar las fotos y los videos.";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "day-secondary";
      retry.textContent = "Volver a intentar";
      retry.onclick = () => this.load();
      this.append(retry);
    }
  }

  assetUrl(owner, item, asset, rawUrl) {
    const url = new URL(rawUrl, location.origin);
    if (url.origin !== location.origin || url.pathname !== "/api/boat/manual-media" ||
        url.searchParams.get("boat") !== owner || url.searchParams.get("item") !== item ||
        url.searchParams.get("asset") !== asset) throw Error();
    return url.href;
  }

  card(owner, item) {
    const videoUrl = this.assetUrl(owner, item.id, "video", item.videoUrl);
    const photos = item.photos.map((photo, index) => ({
      url: this.assetUrl(owner, item.id, "photo-" + (index + 1), photo.url),
      caption: photo.caption || item.title
    }));

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
      for (const other of this.querySelectorAll("details[open]")) {
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
        const link = document.createElement("a");
        link.href = photo.url;
        link.target = "_blank";
        link.rel = "noopener";
        link.setAttribute("aria-label", "Ampliar foto: " + photo.caption);
        const image = document.createElement("img");
        image.loading = "lazy";
        image.alt = photo.caption;
        image.src = photo.url;
        const caption = document.createElement("figcaption");
        caption.textContent = photo.caption;
        image.onerror = () => {
          if (figure.querySelector("button")) return;
          const retry = document.createElement("button");
          retry.type = "button";
          retry.className = "day-secondary";
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
