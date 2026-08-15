import type { ControlFrame, GameSettings, InputDevice } from "./types";

type ActionName = "camera" | "hover" | "pause" | "target" | "weapon";

const clamp = (value: number, min = -1, max = 1) => Math.min(max, Math.max(min, value));

const deadzone = (value: number, zone: number) => {
  const magnitude = Math.abs(value);
  if (magnitude <= zone) return 0;
  return Math.sign(value) * ((magnitude - zone) / (1 - zone));
};

export class InputManager {
  private readonly keys = new Set<string>();
  private readonly mouseButtons = new Set<number>();
  private readonly pressed = new Set<ActionName>();
  private previousButtons: boolean[] = [];
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;
  private lastDevice: InputDevice = "keyboard-mouse";

  constructor(private readonly canvas: HTMLCanvasElement, private readonly settings: GameSettings) {
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    canvas.addEventListener("contextmenu", this.preventContextMenu);
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("contextmenu", this.preventContextMenu);
  }

  read(): ControlFrame {
    const gamepad = this.getGamepad();
    const zone = this.settings.controllerDeadzone;
    let pitch = (this.down("KeyS") ? 1 : 0) - (this.down("KeyW") ? 1 : 0);
    let roll = (this.down("KeyD") ? 1 : 0) - (this.down("KeyA") ? 1 : 0);
    let yaw = (this.down("KeyE") ? 1 : 0) - (this.down("KeyQ") ? 1 : 0);
    let collective = (this.down("ShiftLeft") || this.down("ShiftRight") ? 1 : 0) - (this.down("ControlLeft") || this.down("ControlRight") ? 1 : 0);
    let lookX = 0;
    let lookY = 0;
    let firePrimary = this.down("Space") || this.mouseButtons.has(0);
    let fireSecondary = this.mouseButtons.has(2);

    if (document.pointerLockElement === this.canvas) {
      const scale = this.settings.mouseSensitivity * 0.018;
      roll = clamp(roll + this.mouseDeltaX * scale);
      pitch = clamp(pitch + this.mouseDeltaY * scale * (this.settings.invertY ? -1 : 1));
      if (Math.abs(this.mouseDeltaX) + Math.abs(this.mouseDeltaY) > 0.1) this.lastDevice = "keyboard-mouse";
    }

    if (gamepad) {
      const axes = gamepad.axes;
      const leftX = deadzone(axes[0] ?? 0, zone);
      const leftY = deadzone(axes[1] ?? 0, zone);
      const rightX = deadzone(axes[2] ?? 0, zone);
      const rightY = deadzone(axes[3] ?? 0, zone);
      const leftTrigger = gamepad.buttons[6]?.value ?? 0;
      const rightTrigger = gamepad.buttons[7]?.value ?? 0;
      const padActive = Math.abs(leftX) + Math.abs(leftY) + Math.abs(rightX) + Math.abs(rightY) + leftTrigger + rightTrigger > 0.08 || gamepad.buttons.some((button) => button.pressed);

      if (padActive) {
        this.lastDevice = "gamepad";
        roll = leftX;
        pitch = leftY * (this.settings.invertY ? -1 : 1);
        yaw = (gamepad.buttons[5]?.value ?? 0) - (gamepad.buttons[4]?.value ?? 0);
        collective = rightTrigger - leftTrigger;
        lookX = rightX;
        lookY = rightY;
        firePrimary ||= gamepad.buttons[0]?.pressed ?? false;
        fireSecondary ||= gamepad.buttons[1]?.pressed ?? false;
      }
      this.capturePadEdges(gamepad);
    }

    this.mouseDeltaX *= 0.18;
    this.mouseDeltaY *= 0.18;
    return { pitch: clamp(pitch), roll: clamp(roll), yaw: clamp(yaw), collective: clamp(collective), lookX, lookY, firePrimary, fireSecondary, device: this.lastDevice };
  }

  consume(action: ActionName) {
    const active = this.pressed.has(action);
    this.pressed.delete(action);
    return active;
  }

  async pulse(strong = 0.5, weak = 0.25, duration = 90) {
    const gamepad = this.getGamepad();
    try {
      await gamepad?.vibrationActuator.playEffect("dual-rumble", {
        duration,
        strongMagnitude: clamp(strong, 0, 1),
        weakMagnitude: clamp(weak, 0, 1),
      });
    } catch {
      // Haptics are a progressive enhancement and vary by browser/controller.
    }
  }

  private capturePadEdges(gamepad: Gamepad) {
    const map: Array<[number, ActionName]> = [[3, "camera"], [10, "hover"], [9, "pause"], [2, "weapon"], [12, "target"]];
    for (const [button, action] of map) {
      const current = gamepad.buttons[button]?.pressed ?? false;
      if (current && !this.previousButtons[button]) this.pressed.add(action);
      this.previousButtons[button] = current;
    }
  }

  private getGamepad() {
    if (!("getGamepads" in navigator)) return null;
    return Array.from(navigator.getGamepads()).find((gamepad): gamepad is Gamepad => Boolean(gamepad?.connected)) ?? null;
  }

  private down(code: string) { return this.keys.has(code); }

  private onKeyDown = (event: KeyboardEvent) => {
    const controlCodes = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "Space", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "KeyC", "KeyH", "KeyP", "Escape", "Tab"]);
    if (controlCodes.has(event.code)) event.preventDefault();
    if (!event.repeat) {
      if (event.code === "KeyC") this.pressed.add("camera");
      if (event.code === "KeyH") this.pressed.add("hover");
      if (event.code === "KeyP" || event.code === "Escape") this.pressed.add("pause");
      if (event.code === "Tab") this.pressed.add("target");
      if (event.code === "KeyR") this.pressed.add("weapon");
    }
    this.keys.add(event.code);
    this.lastDevice = "keyboard-mouse";
  };

  private onKeyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  private onMouseMove = (event: MouseEvent) => {
    if (document.pointerLockElement !== this.canvas) return;
    this.mouseDeltaX += event.movementX;
    this.mouseDeltaY += event.movementY;
  };
  private onMouseDown = (event: MouseEvent) => {
    this.mouseButtons.add(event.button);
    this.lastDevice = "keyboard-mouse";
    if (document.pointerLockElement !== this.canvas) void this.canvas.requestPointerLock();
  };
  private onMouseUp = (event: MouseEvent) => { this.mouseButtons.delete(event.button); };
  private preventContextMenu = (event: Event) => event.preventDefault();
}
