class App {
  constructor() {
    this.onClickAudience = this.onClickAudience.bind(this);
    this.onClickConnect = this.onClickConnect.bind(this);
    this.onClickPresenterStream = this.onClickPresenterStream.bind(this);

    this.onData = this.onData.bind(this);
    this.onLeave = this.onLeave.bind(this);
    this.onStream = this.onStream.bind(this);

    this.init();
  }

  init() {
    const url = new URL(document.URL);
    this.key = url.searchParams.get("key");
    this.roomId = url.searchParams.get("roomId");

    if (!this.key || !this.roomId) {
      alert("No key or room id");
      return;
    }

    $("#room-label").textContent = this.roomId;
    $("#connect-button").addEventListener("click", this.onClickConnect);
    $("#presenter-stream").addEventListener("click", this.onClickPresenterStream);
  }

  async connect() {
    const peer = await this.connectPeer(this.key);
    const stream = await this.connectLocalMedia(peer);
    const room = peer.joinRoom(this.roomId, { mode: "mesh", stream });

    room.on("data", this.onData);
    room.on("stream", this.onStream);
    room.on("peerLeave", this.onLeave);

    this.peer = peer;
    this.room = room;
  }

  async connectLocalMedia(peer) {
    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    await this.createAudienceUI(localStream, peer.id, true);
    return localStream;
  }

  async connectPeer(key) {
    return new Promise(r => {
      const peer = new Peer({ key });
      peer.on("open", () => r(peer));
    });
  }

  async createAudienceUI(stream, peerId, isMuted) {
    const li = document.createElement("li");
    li.classList.add("audience");
    li.id = this.getAudienceId(peerId);
    li.dataset.peerId = peerId;

    const video = document.createElement("video");
    video.classList.add("audience-stream");
    video.muted = isMuted;
    video.srcObject = stream;
    video.playsInline = true;
    await video.play();

    li.appendChild(video);
    $("#audiences").appendChild(li);

    li.addEventListener("click", this.onClickAudience);
  }

  dispatchToRoom(data) {
    this.room.send(data);
    // As the data is not sent to local by room.send, we send it to local as well manually.
    this.onData({ src: this.peer.id, data });
  }

  getAudienceId(peerId) {
    return `audience-${ peerId }`;
  }

  getPointId(peerId) {
    return `point-${ peerId }`;
  }

  async pointPresenterStream(peerId, x, y) {
    const presenterVideo = $("#presenter-stream");
    const pointX = presenterVideo.offsetLeft + presenterVideo.clientWidth * x;
    const pointY = presenterVideo.offsetTop + presenterVideo.clientHeight * y;

    const pointId = this.getPointId(peerId);
    const presenter = $("#presenter");
    let point = presenter.querySelector(`#${ pointId }`);
    if (point) {
      point.remove();
    }

    point = document.createElement("mark");
    point.id = pointId;
    point.classList.add("point");
    point.style.left = `${ pointX }px`;
    point.style.top = `${ pointY }px`;
    presenter.appendChild(point);
  }

  async switchPresenterStream(peerId) {
    const selectedClass = "selected-audience";
    const selected = $(`.${ selectedClass }`);
    if (selected) {
      selected.classList.remove(selectedClass);
    }

    const audience = $(`#${ this.getAudienceId(peerId) }`);
    const audienceVideo = audience.querySelector("video");
    const presenterVideo = $("#presenter-stream");
    presenterVideo.muted = peerId === this.peer.id;
    presenterVideo.srcObject = audienceVideo.srcObject;
    await presenterVideo.play();

    audience.classList.add(selectedClass);
  }

  async onClickAudience({ target }) {
    const { peerId } = target.dataset;
    this.dispatchToRoom({ command: "switch-presenter-stream", peerId });
  }

  async onClickConnect() {
    await this.connect();
    $("#connect-form").remove();
  }

  async onClickPresenterStream({ target, layerX, layerY }) {
    const { clientWidth, clientHeight } = target;
    const x = layerX / clientWidth;
    const y = layerY / clientHeight;
    this.dispatchToRoom({ command: "point-presenter-stream", peerId: this.peer.id, x, y });
  }

  async onData({ data }) {
    switch (data.command) {
      case "point-presenter-stream": {
        this.pointPresenterStream(data.peerId, data.x, data.y);
        break;
      }
      case "switch-presenter-stream": {
        this.switchPresenterStream(data.peerId);
        break;
      }
    }
  }

  async onLeave(peerId) {
    $(`#${ this.getAudienceId(peerId) }`).remove();
  }

  async onStream(stream) {
    await this.createAudienceUI(stream, stream.peerId, false);

    // Tell the current presenter to new audience.
    const { peerId } = $(`.selected-audience`).dataset;
    if (peerId === this.peer.id) {
      this.dispatchToRoom({ command: "switch-presenter-stream", peerId });
    }
  }
}

function $(selector) {
  return document.querySelector(selector);
}

document.addEventListener("DOMContentLoaded", () => new App());
