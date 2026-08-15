import { z } from "zod";
import type { NetworkFlightState, NetworkStatus } from "./types";

const stateSchema = z.object({
  type: z.literal("state"),
  payload: z.object({
    position: z.tuple([z.number(), z.number(), z.number()]),
    rotation: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    velocity: z.tuple([z.number(), z.number(), z.number()]),
    rotorRpm: z.number(),
    hull: z.number(),
    timestamp: z.number(),
  }),
});

const eventSchema = z.object({
  type: z.literal("event"),
  name: z.enum(["cannon", "rocket", "missile", "notice"]),
  payload: z.record(z.string(), z.unknown()).optional(),
});

type NetworkEvent = z.infer<typeof eventSchema>;

const encodeSignal = (description: RTCSessionDescriptionInit) => {
  const bytes = new TextEncoder().encode(JSON.stringify(description));
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const decodeSignal = (code: string): RTCSessionDescriptionInit => {
  const normalized = code.trim().replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "===".slice((normalized.length + 3) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as RTCSessionDescriptionInit;
};

export class NetworkSession {
  status: NetworkStatus = "offline";
  onStatus: (status: NetworkStatus) => void = () => undefined;
  onRemoteState: (state: NetworkFlightState) => void = () => undefined;
  onEvent: (event: NetworkEvent) => void = () => undefined;
  private peer: RTCPeerConnection | null = null;
  private stateChannel: RTCDataChannel | null = null;
  private eventChannel: RTCDataChannel | null = null;

  async createOffer() {
    this.dispose();
    this.setStatus("hosting");
    const peer = this.createPeer();
    this.stateChannel = peer.createDataChannel("state", {
      ordered: false,
      maxRetransmits: 0,
    });
    this.eventChannel = peer.createDataChannel("events", { ordered: true });
    this.bindChannels();
    await peer.setLocalDescription(await peer.createOffer());
    await this.waitForIce(peer);
    if (!peer.localDescription) throw new Error("The browser did not create a host description.");
    this.setStatus("connecting");
    return encodeSignal(peer.localDescription);
  }

  async acceptOffer(code: string) {
    this.dispose();
    this.setStatus("joining");
    const peer = this.createPeer();
    peer.ondatachannel = (event) => {
      if (event.channel.label === "state") this.stateChannel = event.channel;
      if (event.channel.label === "events") this.eventChannel = event.channel;
      this.bindChannels();
    };
    await peer.setRemoteDescription(decodeSignal(code));
    await peer.setLocalDescription(await peer.createAnswer());
    await this.waitForIce(peer);
    if (!peer.localDescription) throw new Error("The browser did not create a wingman description.");
    this.setStatus("connecting");
    return encodeSignal(peer.localDescription);
  }

  async acceptAnswer(code: string) {
    if (!this.peer) throw new Error("Create a host invite before applying an answer.");
    await this.peer.setRemoteDescription(decodeSignal(code));
    this.setStatus("connecting");
  }

  sendState(state: NetworkFlightState) {
    if (this.stateChannel?.readyState !== "open" || this.stateChannel.bufferedAmount > 48_000) return;
    this.stateChannel.send(JSON.stringify({ type: "state", payload: state }));
  }

  sendEvent(name: NetworkEvent["name"], payload?: Record<string, unknown>) {
    if (this.eventChannel?.readyState !== "open") return;
    this.eventChannel.send(JSON.stringify({ type: "event", name, payload }));
  }

  dispose() {
    this.stateChannel?.close();
    this.eventChannel?.close();
    this.peer?.close();
    this.peer = null;
    this.stateChannel = null;
    this.eventChannel = null;
    if (this.status !== "offline") this.setStatus("offline");
  }

  private createPeer() {
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      bundlePolicy: "max-bundle",
    });
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") this.setStatus("connected");
      if (["failed", "closed"].includes(peer.connectionState)) this.setStatus("failed");
    };
    this.peer = peer;
    return peer;
  }

  private bindChannels() {
    if (this.stateChannel) {
      this.stateChannel.binaryType = "arraybuffer";
      this.stateChannel.onopen = () => this.setStatus("connected");
      this.stateChannel.onmessage = (event) => {
        try {
          const parsed = stateSchema.safeParse(JSON.parse(String(event.data)));
          if (parsed.success) this.onRemoteState(parsed.data.payload);
        } catch {
          // Invalid remote packets are ignored rather than entering game state.
        }
      };
    }
    if (this.eventChannel) {
      this.eventChannel.onmessage = (event) => {
        try {
          const parsed = eventSchema.safeParse(JSON.parse(String(event.data)));
          if (parsed.success) this.onEvent(parsed.data);
        } catch {
          // Invalid remote events are ignored.
        }
      };
    }
  }

  private setStatus(status: NetworkStatus) {
    this.status = status;
    this.onStatus(status);
  }

  private waitForIce(peer: RTCPeerConnection) {
    if (peer.iceGatheringState === "complete") return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => {
        peer.removeEventListener("icegatheringstatechange", listener);
        resolve();
      }, 7000);
      const listener = () => {
        if (peer.iceGatheringState !== "complete") return;
        window.clearTimeout(timeout);
        peer.removeEventListener("icegatheringstatechange", listener);
        resolve();
      };
      peer.addEventListener("icegatheringstatechange", listener);
    });
  }
}
