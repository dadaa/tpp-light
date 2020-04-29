class App {
  constructor() {
    this.onClickConnect = this.onClickConnect.bind(this);

    this.onClickAudience = this.onClickAudience.bind(this);
    this.onClickCameraSwitching = this.onClickCameraSwitching.bind(this);
    this.onClickPresenterStream = this.onClickPresenterStream.bind(this);

    this.onData = this.onData.bind(this);
    this.onLeave = this.onLeave.bind(this);
    this.onStream = this.onStream.bind(this);

    this.init();
  }

  async init() {
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

    const devices = await this.getVideoInputDevices();
    if (devices.length > 1) {
      $("#camera-switching").addEventListener("click", this.onClickCameraSwitching);
    } else {
      $("#camera-switching").remove();
    }
  }

  async connect() {
    const peer = await this.connectPeer(this.key);
    const stream = await this.getNextVideoStream();
    const room = peer.joinRoom(this.roomId, {
      mode: "mesh",
      stream: stream
    });

    await this.createAudienceUI(stream, peer.id, true);

    room.on("data", this.onData);
    room.on("stream", this.onStream);
    room.on("peerLeave", this.onLeave);

    this.peer = peer;
    this.room = room;
  }

  connectPeer(key) {
    return new Promise(r => {
      const peer = new Peer({ key: key });
      peer.on("open", () => r(peer));
    });
  }

  async createAudienceUI(stream, peerId, isLocal) {
    const li = document.createElement("li");
    li.classList.add("audience");
    li.id = this.getAudienceId(peerId);
    li.dataset.peerId = peerId;

    const video = document.createElement("video");
    video.classList.add("audience-stream");
    if (isLocal) {
      video.classList.add("local-stream");
    }
    video.muted = isLocal;
    video.srcObject = stream;
    video.playsInline = true;
    video.play();

    li.appendChild(video);
    $("#audiences").appendChild(li);

    li.addEventListener("click", this.onClickAudience);
  }

  dispatchToRoom(data) {
    this.room.send(data);
    // As the data is not sent to local by room.send, we send it to local as well manually.
    this.onData({ src: this.peer.id, data: data });
  }

  getAudienceId(peerId) {
    return `audience-${ peerId }`;
  }

  getPointId(peerId) {
    return `point-${ peerId }`;
  }

  async getNextVideoStream() {
    const devices = await this.getVideoInputDevices();
    let nextDevice = null;
    if (!this.currentVideoDeviceId) {
      // Use first device.
      nextDevice = devices[0];
    } else {
      const index = devices.findIndex(device => device.deviceId === this.currentVideoDeviceId);
      nextDevice = index === devices.length - 1 ? devices[0] : devices[index + 1];
    }

    const deviceId = nextDevice ? nextDevice.deviceId : "";

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { deviceId: deviceId },
    });

    this.currentVideoDeviceId = deviceId;
    return stream;
  }

  async getVideoInputDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === "videoinput");
  }

  amIPresenter() {
    const { peerId } = $(".selected-audience").dataset;
    return peerId === this.peer.id;
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
    presenterVideo.playsInline = true;
    presenterVideo.play();

    audience.classList.add(selectedClass);
  }

  async onClickAudience({ target }) {
    const { peerId } = target.dataset;
    this.dispatchToRoom({ command: "switch-presenter-stream", peerId });
  }

  async onClickCameraSwitching() {
    const stream = await this.getNextVideoStream();

    // Request to replace remote stream.
    this.room.replaceStream(stream);

    // Replace local stream.
    if (this.amIPresenter()) {
      const presenterVideo = $("#presenter-stream");
      presenterVideo.srcObject = stream;
      presenterVideo.play();
    }

    const audienceVideo = $(".local-stream");
    audienceVideo.srcObject = stream;
    audienceVideo.play();
  }

  async onClickConnect() {
    try {
      await this.connect();
    } catch (e) {
      console.log(e);
    }


    $("#connect-form").remove();
  }

  async onClickPresenterStream({ target, layerX, layerY }) {
    const { clientWidth, clientHeight } = target;
    const x = layerX / clientWidth;
    const y = layerY / clientHeight;
    this.dispatchToRoom({
      command: "point-presenter-stream",
      peerId: this.peer.id,
      x: x,
      y: y
    });
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
    if (this.amIPresenter()) {
      this.dispatchToRoom({
        command: "switch-presenter-stream",
        peerId: peerId
      });
    }
  }
}

function $(selector) {
  return document.querySelector(selector);
}

document.addEventListener("DOMContentLoaded", () => new App());
