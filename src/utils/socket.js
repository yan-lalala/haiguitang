/**
 * 跨端 WebSocket 联机客户端（兼容 uni-app 与标准 H5 浏览器）
 */

class ManorSocketClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.eventListeners = {};
    this.pendingQueue = [];
  }

  /**
   * 连接服务器
   * @param {string} customUrl 可选自定义地址，默认探测当前局域网或 localhost
   */
  connect(customUrl = null) {
    if (this.connected && this.ws) return Promise.resolve();

    let serverUrl = customUrl;
    if (!serverUrl) {
      try {
        const savedWs = uni.getStorageSync('manor_custom_ws_url');
        if (savedWs && savedWs.trim()) {
          serverUrl = savedWs.trim();
        }
      } catch (e) {}
    }

    if (!serverUrl) {
      if (typeof window !== 'undefined' && window.location) {
        const isHttps = window.location.protocol === 'https:';
        const host = window.location.hostname || 'localhost';
        const isLocal = host === 'localhost' || host === '127.0.0.1' || host.startsWith('10.') || host.startsWith('192.168.');
        if (isLocal) {
          serverUrl = `ws://${host}:3000`;
        } else {
          // 云端生产环境：自动采用安全 WebSocket (wss://) 并共享主域名与端口
          const wsProtocol = isHttps ? 'wss:' : 'ws:';
          serverUrl = `${wsProtocol}//${window.location.host}`;
        }
      } else {
        serverUrl = 'ws://127.0.0.1:3000';
      }
    }

    return new Promise((resolve, reject) => {
      try {
        if (typeof uni !== 'undefined' && uni.connectSocket) {
          const socketTask = uni.connectSocket({
            url: serverUrl,
            complete: () => {}
          });

          socketTask.onOpen(() => {
            this.connected = true;
            this.ws = socketTask;
            this.flushQueue();
            this.trigger('connected');
            resolve();
          });

          socketTask.onMessage((res) => {
            try {
              const data = JSON.parse(res.data);
              this.trigger(data.type, data);
            } catch (e) {}
          });

          socketTask.onClose(() => {
            this.connected = false;
            this.ws = null;
            this.trigger('disconnected');
          });

          socketTask.onError((err) => {
            this.connected = false;
            this.trigger('error', err);
            reject(err);
          });
        } else if (typeof WebSocket !== 'undefined') {
          const nativeWs = new WebSocket(serverUrl);
          nativeWs.onopen = () => {
            this.connected = true;
            this.ws = nativeWs;
            this.flushQueue();
            this.trigger('connected');
            resolve();
          };

          nativeWs.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              this.trigger(data.type, data);
            } catch (e) {}
          };

          nativeWs.onclose = () => {
            this.connected = false;
            this.ws = null;
            this.trigger('disconnected');
          };

          nativeWs.onerror = (err) => {
            this.connected = false;
            this.trigger('error', err);
            reject(err);
          };
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  send(data) {
    const payload = JSON.stringify(data);
    if (this.connected && this.ws) {
      if (typeof uni !== 'undefined' && this.ws.send) {
        this.ws.send({ data: payload });
      } else {
        this.ws.send(payload);
      }
    } else {
      this.pendingQueue.push(payload);
    }
  }

  flushQueue() {
    while (this.pendingQueue.length > 0) {
      const p = this.pendingQueue.shift();
      if (typeof uni !== 'undefined' && this.ws.send) {
        this.ws.send({ data: p });
      } else {
        this.ws.send(p);
      }
    }
  }

  on(eventName, callback) {
    if (!this.eventListeners[eventName]) {
      this.eventListeners[eventName] = [];
    }
    this.eventListeners[eventName].push(callback);
  }

  off(eventName, callback) {
    if (!this.eventListeners[eventName]) return;
    this.eventListeners[eventName] = this.eventListeners[eventName].filter(cb => cb !== callback);
  }

  trigger(eventName, data) {
    const handlers = this.eventListeners[eventName];
    if (handlers) {
      handlers.forEach(fn => fn(data));
    }
  }

  disconnect() {
    if (this.ws) {
      if (typeof uni !== 'undefined' && this.ws.close) {
        this.ws.close({});
      } else if (this.ws.close) {
        this.ws.close();
      }
    }
    this.connected = false;
    this.ws = null;
  }
}

export const manorSocket = new ManorSocketClient();
