"use strict";

const path = require('path');
const WebSocket = require('ws');
const protobuf = require('protobufjs');
const { EventEmitter } = require('events');

class SimpleRustPlus extends EventEmitter {
  constructor(server, port, playerId, playerToken, useFacepunchProxy = false) {
    super();
    this.server = server;
    this.port = port;
    this.playerId = playerId;
    this.playerToken = playerToken;
    this.useFacepunchProxy = useFacepunchProxy;
    this.seq = 0;
    this.seqCallbacks = [];
    this.websocket = null;
  }

  async _loadProto() {
    if (this.AppRequest) return;
    const root = await protobuf.load(path.resolve(__dirname, 'rustplus.proto'));
    this.AppRequest = root.lookupType('rustplus.AppRequest');
    this.AppMessage = root.lookupType('rustplus.AppMessage');
  }

  connect() {
    // load protobuf then connect
    this._loadProto().then(() => {
      if (this.websocket) this.disconnect();
      this.emit('connecting');
      const address = this.useFacepunchProxy
        ? `wss://companion-rust.facepunch.com/game/${this.server}/${this.port}`
        : `ws://${this.server}:${this.port}`;
      const wsOptions = {};
      if (this.useFacepunchProxy) {
        wsOptions.origin = 'https://companion-rust.facepunch.com';
        wsOptions.headers = {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 rustmarkets/1.0',
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache',
        };
      }
      this.websocket = new WebSocket(address, wsOptions);

      this.websocket.on('open', () => this.emit('connected'));
      this.websocket.on('close', () => this.emit('disconnected'));
      this.websocket.on('error', (e) => this.emit('error', e));

      this.websocket.on('message', (data) => {
        try {
          const message = this.AppMessage.decode(data);
          // response callback routing
          if (message.response && message.response.seq && this.seqCallbacks[message.response.seq]) {
            const cb = this.seqCallbacks[message.response.seq];
            const handled = cb(message);
            delete this.seqCallbacks[message.response.seq];
            if (handled) return;
          }
          this.emit('message', message);
        } catch (err) {
          this.emit('error', err);
        }
      });
    });
  }

  disconnect() {
    if (this.websocket) {
      this.websocket.terminate();
      this.websocket = null;
    }
  }

  isConnected() {
    return this.websocket && this.websocket.readyState === WebSocket.OPEN;
  }

  sendRequest(data, callback) {
    const currentSeq = ++this.seq;
    if (callback) this.seqCallbacks[currentSeq] = callback;
    const request = this.AppRequest.fromObject({
      seq: currentSeq,
      playerId: this.playerId,
      playerToken: this.playerToken,
      ...data,
    });
    this.websocket.send(this.AppRequest.encode(request).finish());
    this.emit('request', request);
  }

  sendRequestAsync(data, timeoutMilliseconds = 10000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for response')), timeoutMilliseconds);
      this.sendRequest(data, (message) => {
        clearTimeout(timeout);
        if (message.response && message.response.error) {
          reject(message.response.error);
        } else {
          resolve(message.response);
        }
      });
    });
  }

  getMapMarkers(callback) {
    this.sendRequest({ getMapMarkers: {} }, callback);
  }

  getInfo(callback) {
    this.sendRequest({ getInfo: {} }, callback);
  }

  getMap(callback) {
    this.sendRequest({ getMap: {} }, callback);
  }
}

module.exports = SimpleRustPlus;
