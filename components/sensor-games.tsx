"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import godirect from "@vernier/godirect";
import {
  Bluetooth,
  Check,
  CircleHelp,
  Gamepad2,
  RotateCcw,
  Thermometer,
  Trophy,
  Usb,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type GameKind = "temperature" | "acceleration";
type Transport = "bluetooth" | "usb";
type ConnectionStatus = "demo" | "connecting" | "connected" | "error";

type Reading = {
  temperature: number;
  x: number;
  y: number;
  z: number;
};

type GdxSensor = {
  name: string;
  unit: string;
  value: number;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  on: (event: string, callback: (sensor: GdxSensor) => void) => void;
};

type GdxDevice = {
  name: string;
  sensors: GdxSensor[];
  stop: () => void;
  start: (period?: number) => void;
  close: () => Promise<unknown>;
  on: (event: string, callback: () => void) => void;
};

type TemperatureMission = "warmer" | "cooler" | "steady" | "warmer-fast" | "combo";
type TemperatureLevel = {
  name: string;
  en: string;
  icon: string;
  mission: TemperatureMission;
  duration: number;
  target: number;
  objective: string;
  hint: string;
};

type Gesture = "left" | "right" | "up" | "down" | "shake";
type MotionLevel = { name: string; en: string; seconds: number; sequence: Gesture[]; objective: string };

const TEMPERATURE_LEVELS: TemperatureLevel[] = [
  { name: "ช่วยลูกเจี๊ยบให้อุ่น", en: "Warm the chick", icon: "🐣", mission: "warmer", duration: 12, target: 1.5, objective: "ทำให้อุ่นขึ้น 1.5 °C", hint: "ใช้มืออุ่น ๆ จับปลายโพรบ หรือกดปุ่ม “อุ่นขึ้น”" },
  { name: "ช่วยไอศกรีมให้เย็น", en: "Cool the ice cream", icon: "🍦", mission: "cooler", duration: 12, target: 1.5, objective: "ทำให้เย็นลง 1.5 °C", hint: "แตะโพรบกับถ้วยเย็น หรือกดปุ่ม “เย็นลง”" },
  { name: "ดูแลไข่ไดโนเสาร์", en: "Keep it steady", icon: "🥚", mission: "steady", duration: 8, target: 3, objective: "วางให้นิ่งในโซนปลอดภัย 3 วินาที", hint: "วางโพรบไว้เฉย ๆ อย่าจับหรือย้ายระหว่างเล่น" },
  { name: "โกโก้อุ่นด่วน", en: "Quick warm-up", icon: "☕", mission: "warmer-fast", duration: 10, target: 3, objective: "ทำให้อุ่นขึ้น 3 °C", hint: "ใช้ถ้วยน้ำอุ่น หรือกด “อุ่นขึ้น” หลายครั้งติดกัน" },
  { name: "สลับร้อน–เย็น", en: "Warm then cool", icon: "🎨", mission: "combo", duration: 16, target: 1.5, objective: "อุ่นขึ้นก่อน แล้วทำให้เย็นลง", hint: "เริ่มจากถ้วยอุ่น เมื่อผ่านครึ่งแรกให้ย้ายไปถ้วยเย็น" },
];

const MOTION_LEVELS: MotionLevel[] = [
  { name: "ซ้ายแล้วขวา", en: "Left & right", seconds: 18, sequence: ["left", "right"], objective: "ดูภาพใหญ่ แล้วเอียงตามทีละท่า" },
  { name: "ขึ้นแล้วลง", en: "Up & down", seconds: 18, sequence: ["up", "down"], objective: "เอียงตามลูกศร 2 ท่า" },
  { name: "สามท่าหรรษา", en: "Three fun moves", seconds: 18, sequence: ["right", "up", "left"], objective: "ทำตามทีละท่า ไม่ต้องจำล่วงหน้า" },
  { name: "เขย่าให้สุด", en: "Shake it", seconds: 18, sequence: ["shake", "left", "right"], objective: "เขย่าหนึ่งครั้ง แล้วตามลูกศร" },
  { name: "รอบทิศพิชิตชัย", en: "Victory round", seconds: 20, sequence: ["up", "right", "down", "left"], objective: "ผ่าน 4 ท่าง่าย ๆ เพื่อรับถ้วยรางวัล" },
];

function formatValue(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : "—";
}

function useGoDirect() {
  const [status, setStatus] = useState<ConnectionStatus>("demo");
  const [deviceName, setDeviceName] = useState("");
  const [error, setError] = useState("");
  const [connectedKind, setConnectedKind] = useState<GameKind | null>(null);
  const [reading, setReading] = useState<Reading>({ temperature: 25, x: 0, y: 0, z: 0 });
  const deviceRef = useRef<GdxDevice | null>(null);

  const disconnect = useCallback(async () => {
    const device = deviceRef.current;
    deviceRef.current = null;
    if (device) {
      try {
        await device.close();
      } catch {
        // The browser may already have closed the device.
      }
    }
    setStatus("demo");
    setDeviceName("");
    setConnectedKind(null);
    setError("");
  }, []);

  useEffect(() => {
    return () => {
      void deviceRef.current?.close();
    };
  }, []);

  const connect = useCallback(async (kind: GameKind, transport: Transport) => {
    setStatus("connecting");
    setError("");

    try {
      const browserNavigator = navigator as Navigator & { bluetooth?: unknown; hid?: unknown };
      if (!window.isSecureContext) {
        throw new Error("Bluetooth ต้องเปิดผ่าน HTTPS หรือ localhost เท่านั้น");
      }
      if (transport === "bluetooth" && !browserNavigator.bluetooth) {
        throw new Error("หน้า Preview นี้เข้าถึง Bluetooth ของเครื่องไม่ได้ กรุณาเปิดเว็บด้วย Chrome หรือ Edge บนเครื่องที่ต่อเซนเซอร์");
      }
      if (transport === "usb" && !browserNavigator.hid) {
        throw new Error("เบราว์เซอร์นี้ไม่มี WebHID กรุณาเปิดเว็บด้วย Chrome หรือ Edge บนคอมพิวเตอร์");
      }
      if (deviceRef.current) {
        throw new Error("กรุณาตัดการเชื่อมต่อเซนเซอร์เดิมก่อนเลือกอุปกรณ์ใหม่");
      }

      // Keep selectDevice directly in the click flow so Web Bluetooth retains
      // the browser's required user activation.
      const device = (await godirect.selectDevice(transport === "bluetooth")) as GdxDevice;
      deviceRef.current = device;

      device.stop();
      device.sensors.forEach((sensor) => sensor.setEnabled(false));

      const normalized = (sensor: GdxSensor) => `${sensor.name} ${sensor.unit}`.toLowerCase();
      if (kind === "temperature") {
        const sensor = device.sensors.find((item) => {
          const text = normalized(item);
          return text.includes("temperature") || text.includes("temp") || text.includes("°c") || text.includes("degc");
        });
        if (!sensor) throw new Error("ไม่พบช่อง Temperature ในอุปกรณ์ที่เลือก");
        sensor.setEnabled(true);
        sensor.on("value-changed", (channel) => {
          setReading((current) => ({ ...current, temperature: Number(channel.value) }));
        });
        device.start(250);
      } else {
        const findAxis = (axis: "x" | "y" | "z") =>
          device.sensors.find((item) => {
            const text = normalized(item);
            return text.includes(`${axis}-axis acceleration`) && !text.includes("high") && !text.includes("gyro");
          });
        const x = findAxis("x");
        const y = findAxis("y");
        const z = findAxis("z");
        if (!x || !y || !z) throw new Error("ไม่พบช่อง X, Y และ Z acceleration ในอุปกรณ์ที่เลือก");
        [x, y, z].forEach((sensor) => sensor.setEnabled(true));
        x.on("value-changed", (channel) => setReading((current) => ({ ...current, x: Number(channel.value) })));
        y.on("value-changed", (channel) => setReading((current) => ({ ...current, y: Number(channel.value) })));
        z.on("value-changed", (channel) => setReading((current) => ({ ...current, z: Number(channel.value) })));
        device.start(50);
      }

      device.on("device-closed", () => {
        deviceRef.current = null;
        setStatus("demo");
        setDeviceName("");
        setConnectedKind(null);
      });
      setDeviceName(device.name || "Go Direct Sensor");
      setConnectedKind(kind);
      setStatus("connected");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      const cancelled =
        (caught instanceof DOMException && caught.name === "NotFoundError") ||
        /cancel|no device selected/i.test(message);
      try {
        await deviceRef.current?.close();
      } catch {
        // Ignore cleanup errors and preserve the useful connection error.
      }
      if (!cancelled) setError(message);
      setStatus(cancelled ? "demo" : "error");
      setConnectedKind(null);
      deviceRef.current = null;
    }
  }, []);

  return { status, deviceName, error, connectedKind, reading, connect, disconnect };
}

function ConnectionDock({
  activeGame,
  status,
  deviceName,
  error,
  connectedKind,
  transport,
  setTransport,
  onConnect,
  onDisconnect,
}: {
  activeGame: GameKind;
  status: ConnectionStatus;
  deviceName: string;
  error: string;
  connectedKind: GameKind | null;
  transport: Transport;
  setTransport: (value: Transport) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const browserApi: { bluetooth?: unknown; hid?: unknown } =
    typeof navigator === "undefined" ? {} : (navigator as Navigator & { bluetooth?: unknown; hid?: unknown });
  const supported = transport === "bluetooth" ? Boolean(browserApi.bluetooth) : Boolean(browserApi.hid);
  const isConnectedHere = status === "connected" && connectedKind === activeGame;
  const isConnectedElsewhere = status === "connected" && connectedKind !== activeGame;

  return (
    <section className="connection-dock" aria-label="Sensor connection">
      <div className="connection-copy">
        <span className={`status-dot ${isConnectedHere ? "is-live" : ""}`} />
        <div>
          <strong>{isConnectedHere ? deviceName : "โหมดทดลอง / Demo mode"}</strong>
          <p>{isConnectedHere ? "กำลังรับค่าจริงจากเซนเซอร์" : "เล่นได้ทันที หรือเชื่อมต่อเซนเซอร์ด้านขวา"}</p>
        </div>
      </div>

      <RadioGroup value={transport} onValueChange={(value) => setTransport(value as Transport)} className="transport-options">
        <label className="transport-choice">
          <RadioGroupItem value="bluetooth" />
          <Bluetooth size={17} /> Bluetooth
        </label>
        <label className="transport-choice">
          <RadioGroupItem value="usb" />
          <Usb size={17} /> USB
        </label>
      </RadioGroup>

      {isConnectedHere || isConnectedElsewhere ? (
        <Button variant="outline" onClick={onDisconnect} className="disconnect-button">
          <X /> {isConnectedHere ? "ตัดการเชื่อมต่อ" : "ตัดเซนเซอร์เดิมก่อน"}
        </Button>
      ) : (
        <Button onClick={onConnect} disabled={status === "connecting"} className="connect-button">
          {status === "connecting" ? "กำลังค้นหา…" : supported ? "ค้นหา Go Direct" : "ตรวจสอบ Bluetooth"}
        </Button>
      )}

      {!supported && !isConnectedHere && (
        <p className="connection-capability">
          เว็บรองรับ Bluetooth แต่หน้า Preview ระยะไกลมองไม่เห็นอุปกรณ์ของเครื่องคุณ—เปิดผ่าน Chrome/Edge บนเครื่องจริงเพื่อสแกน GDX
        </p>
      )}
      {error && <p className="connection-error">{error}</p>}
    </section>
  );
}

function LevelRail({ level, onLevel }: { level: number; onLevel: (index: number) => void }) {
  return (
    <div className="level-rail" aria-label="เลือกด่าน">
      {[0, 1, 2, 3, 4].map((index) => (
        <button
          key={index}
          type="button"
          onClick={() => onLevel(index)}
          className={index === level ? "active" : index < level ? "passed" : ""}
          aria-label={`ด่าน ${index + 1}`}
        >
          {index < level ? <Check size={16} /> : index + 1}
        </button>
      ))}
      <span className="level-line" />
    </div>
  );
}

function GuideDialog({ kind }: { kind: GameKind }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><CircleHelp /> วิธีเล่น</Button>
      </DialogTrigger>
      <DialogContent className="guide-dialog">
        <DialogHeader>
          <DialogTitle>{kind === "temperature" ? "วิธีเล่น ภารกิจร้อน–เย็น" : "วิธีเล่น ทำท่าตามฉัน"}</DialogTitle>
          <DialogDescription>เกมสั้นสำหรับออกบูธ ดูภาพแล้วลงมือได้ทันที</DialogDescription>
        </DialogHeader>
        {kind === "temperature" ? (
          <ol>
            <li><b>1.</b> ดูตัวละครและคำสั่งสั้น ๆ ว่าต้อง “อุ่นขึ้น” หรือ “เย็นลง”</li>
            <li><b>2.</b> กดเริ่ม แล้วแตะโพรบกับถ้วยอุ่น ถ้วยเย็น หรือใช้มือ</li>
            <li><b>3.</b> แถบสีจะเติมทันทีเมื่ออุณหภูมิเปลี่ยน ไม่ต้องอ่านกราฟ</li>
            <li><b>4.</b> ถ้ายังไม่ผ่าน 3 ครั้ง ระบบจะแสดงคำใบ้ง่าย ๆ</li>
          </ol>
        ) : (
          <ol>
            <li><b>1.</b> วาง GDX-ACC ในท่าเริ่มต้นแล้วกด Set zero acceleration</li>
            <li><b>2.</b> กดเริ่ม แล้วดูท่าที่แสดงตัวใหญ่กลางจอ</li>
            <li><b>3.</b> เอียงหรือเขย่าตามทีละท่า ระบบจะเปลี่ยนท่าให้เอง</li>
            <li><b>4.</b> โหมดทดลองกดปุ่มลูกศรแทนเซนเซอร์ได้ และพลาด 3 ครั้งจะเห็นคำใบ้</li>
          </ol>
        )}
        <p className="guide-note">แนะนำ Chrome หรือ Edge และเปิดเว็บผ่าน HTTPS เมื่อต่อ Bluetooth/USB</p>
      </DialogContent>
    </Dialog>
  );
}

function TemperatureGame({ value, isLive, setDemoValue }: { value: number; isLive: boolean; setDemoValue: (value: number) => void }) {
  const [level, setLevel] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(TEMPERATURE_LEVELS[0].duration);
  const [completed, setCompleted] = useState(false);
  const [baseline, setBaseline] = useState(value);
  const [phase, setPhase] = useState(0);
  const [stableMs, setStableMs] = useState(0);
  const [feedback, setFeedback] = useState("กดเริ่ม แล้วทำตามภาพได้เลย");
  const valueRef = useRef(value);
  const baselineRef = useRef(value);
  const phaseRef = useRef(0);
  const stableRef = useRef(0);
  const current = TEMPERATURE_LEVELS[level];

  useEffect(() => { valueRef.current = value; }, [value]);

  const chooseLevel = useCallback((index: number) => {
    setLevel(index);
    setAttempts(0);
    setSecondsLeft(TEMPERATURE_LEVELS[index].duration);
    setPlaying(false);
    setCompleted(false);
    setPhase(0);
    phaseRef.current = 0;
    setStableMs(0);
    stableRef.current = 0;
    setFeedback("กดเริ่ม แล้วทำตามภาพได้เลย");
  }, []);

  const finishMission = useCallback(() => {
    setPlaying(false);
    setCompleted(true);
    setFeedback("เยี่ยมมาก! ภารกิจสำเร็จแล้ว 🎉");
  }, []);

  useEffect(() => {
    if (!playing || completed) return;
    const checker = window.setInterval(() => {
      const delta = valueRef.current - baselineRef.current;
      if (current.mission === "steady") {
        const nextStable = Math.abs(delta) <= 0.4 ? stableRef.current + 100 : 0;
        stableRef.current = nextStable;
        setStableMs(nextStable);
        if (nextStable >= current.target * 1000) finishMission();
      } else if (current.mission === "cooler" && -delta >= current.target) finishMission();
      else if ((current.mission === "warmer" || current.mission === "warmer-fast") && delta >= current.target) finishMission();
      else if (current.mission === "combo") {
        if (phaseRef.current === 0 && delta >= current.target) {
          phaseRef.current = 1;
          setPhase(1);
          baselineRef.current = valueRef.current;
          setBaseline(valueRef.current);
          setFeedback("ครึ่งแรกผ่านแล้ว! ต่อไปทำให้เย็นลง ❄️");
        } else if (phaseRef.current === 1 && -delta >= current.target) finishMission();
      }
    }, 100);
    const clock = window.setInterval(() => {
      setSecondsLeft((seconds) => {
        if (seconds <= 1) {
          setPlaying(false);
          setAttempts((count) => count + 1);
          setFeedback("เกือบแล้ว! กดเริ่มแล้วลองอีกครั้ง");
          return current.duration;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => {
      window.clearInterval(checker);
      window.clearInterval(clock);
    };
  }, [completed, current, finishMission, playing]);

  const startMission = () => {
    baselineRef.current = value;
    setBaseline(value);
    phaseRef.current = 0;
    setPhase(0);
    stableRef.current = 0;
    setStableMs(0);
    setSecondsLeft(current.duration);
    setCompleted(false);
    setFeedback(current.mission === "steady" ? "วางโพรบให้นิ่ง…" : "เริ่มเลย! ดูแถบความคืบหน้า");
    setPlaying(true);
  };

  const delta = value - baseline;
  const progress = current.mission === "steady"
    ? (stableMs / (current.target * 1000)) * 100
    : current.mission === "cooler" || (current.mission === "combo" && phase === 1)
      ? (-delta / current.target) * 100
      : (delta / current.target) * 100;
  const safeProgress = Math.max(0, Math.min(progress, 100));
  const actionWord = current.mission === "steady" ? "อยู่นิ่ง ๆ" : current.mission === "cooler" || (current.mission === "combo" && phase === 1) ? "ทำให้เย็นลง" : "ทำให้อุ่นขึ้น";

  return (
    <div className="game-layout temperature-booth">
      <section className="mission-card booth-game-card">
        <div className="mission-topline">
          <span>ภารกิจร้อน–เย็น · ด่าน {level + 1}</span>
          <GuideDialog kind="temperature" />
        </div>
        <LevelRail level={level} onLevel={chooseLevel} />
        <div className={`booth-stage ${completed ? "is-complete" : ""}`}>
          <div className="booth-character" aria-hidden="true">{completed ? "🏆" : current.icon}</div>
          <p className="booth-kicker">{current.en}</p>
          <h2>{current.name}</h2>
          <div className="booth-command">{completed ? "สำเร็จ!" : actionWord}</div>
          <p className="booth-objective">{current.objective} · {current.duration} วินาที</p>
          <div className={`booth-timer ${playing && secondsLeft <= 5 ? "danger" : ""}`}>{playing ? secondsLeft : current.duration}<small>วินาที</small></div>
          <div className="temperature-readout">
            <span>{isLive ? "ค่าจริงจากโพรบ" : "ค่าจำลอง"}</span>
            <strong>{formatValue(value)} °C</strong>
          </div>
          <div className="booth-progress">
            <Progress value={safeProgress} />
            <b>{Math.round(safeProgress)}%</b>
          </div>
          <p className="booth-feedback" aria-live="polite">{feedback}</p>
        </div>

        {!isLive && (
          <div className="booth-simulator">
            <p><Gamepad2 /> ลองเล่นโดยไม่ต่อเซนเซอร์</p>
            <div>
              <Button variant="outline" onClick={() => setDemoValue(Math.max(0, value - 1))}>❄️ เย็นลง</Button>
              <Button variant="outline" onClick={() => setDemoValue(Math.min(60, value + 1))}>☀️ อุ่นขึ้น</Button>
            </div>
          </div>
        )}

        <div className="mission-actions">
          <div className="attempts">ลองใหม่ {Math.min(attempts, 3)}/3</div>
          {completed ? (
            <Button className="success-button" onClick={() => chooseLevel(Math.min(level + 1, 4))} disabled={level === 4}>
              <Trophy /> {level === 4 ? "ผ่านครบ 5 ด่านแล้ว" : "ไปด่านถัดไป"}
            </Button>
          ) : (
            <Button onClick={startMission}>{playing ? "เริ่มใหม่" : "เริ่มภารกิจ"}</Button>
          )}
        </div>
        {attempts >= 3 && !completed && <div className="solution-box"><Zap /> คำใบ้: <b>{current.hint}</b></div>}
      </section>

      <aside className="science-card booth-note">
        <div className="science-icon"><Thermometer /></div>
        <span>เล่นง่ายใน 10–16 วินาที</span>
        <h3>จับคู่ “ความรู้สึก” กับตัวเลข</h3>
        <p>เด็กจะเห็นทันทีว่าการแตะของอุ่นหรือของเย็นทำให้ค่าบนเซนเซอร์เปลี่ยนไปทางไหน โดยไม่ต้องคำนวณหรืออ่านกราฟ</p>
        <div className="formula-chip">อุ่นขึ้น ↑ · เย็นลง ↓</div>
      </aside>
    </div>
  );
}

const GESTURE_META: Record<Gesture, { label: string; symbol: string; axis: string }> = {
  left: { label: "เอียงซ้าย", symbol: "←", axis: "X−" },
  right: { label: "เอียงขวา", symbol: "→", axis: "X+" },
  up: { label: "เอียงขึ้น", symbol: "↑", axis: "Y−" },
  down: { label: "เอียงลง", symbol: "↓", axis: "Y+" },
  shake: { label: "เขย่า", symbol: "✦", axis: "R สูง" },
};

function CopyMoveGame({ reading, isLive }: { reading: Reading; isLive: boolean }) {
  const [level, setLevel] = useState(0);
  const [zeroOffset, setZeroOffset] = useState({ x: 0, y: 0, z: 0 });
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [seconds, setSeconds] = useState(MOTION_LEVELS[0].seconds);
  const [attempts, setAttempts] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [feedback, setFeedback] = useState("กดเริ่ม แล้วดูท่าใหญ่กลางจอ");
  const lastGestureAt = useRef(0);
  const gestureArmed = useRef(true);
  const raw = isLive ? reading : { x: 0, y: 0, z: 0 };
  const calibrated = { x: raw.x - zeroOffset.x, y: raw.y - zeroOffset.y, z: raw.z - zeroOffset.z };
  const resultant = Math.sqrt(calibrated.x ** 2 + calibrated.y ** 2 + calibrated.z ** 2);
  const current = MOTION_LEVELS[level];
  const expected = current.sequence[sequenceIndex];

  const chooseLevel = useCallback((index: number) => {
    setLevel(index);
    setSequenceIndex(0);
    setPlaying(false);
    setSeconds(MOTION_LEVELS[index].seconds);
    setAttempts(0);
    setCompleted(false);
    setFeedback("กดเริ่ม แล้วดูท่าใหญ่กลางจอ");
  }, []);

  const registerGesture = useCallback((gesture: Gesture) => {
    if (!playing || completed) return;
    const wanted = current.sequence[sequenceIndex];
    if (gesture !== wanted) {
      setAttempts((count) => count + 1);
      setSequenceIndex(0);
      setFeedback(`เห็น “${GESTURE_META[gesture].label}” แต่ภาพเป็นอีกท่า—เริ่มใหม่ได้เลย`);
      return;
    }
    if (sequenceIndex >= current.sequence.length - 1) {
      setSequenceIndex(current.sequence.length);
      setCompleted(true);
      setPlaying(false);
      setFeedback("เก่งมาก! ทำตามครบทุกท่าแล้ว 🎉");
      return;
    }
    setSequenceIndex((index) => index + 1);
    setFeedback("ถูกต้อง! ต่อไปดูท่าใหม่ได้เลย");
  }, [completed, current.sequence, playing, sequenceIndex]);

  useEffect(() => {
    if (!playing || completed) return;
    const clock = window.setInterval(() => {
      setSeconds((time) => {
        if (time <= 1) {
          setPlaying(false);
          setAttempts((count) => count + 1);
          setSequenceIndex(0);
          setFeedback("หมดเวลาแล้ว ไม่เป็นไร—กดเริ่มแล้วลองใหม่");
          return current.seconds;
        }
        return time - 1;
      });
    }, 1000);
    return () => window.clearInterval(clock);
  }, [completed, current.seconds, playing]);

  useEffect(() => {
    if (!playing || !isLive || completed) return;
    const now = Date.now();
    if (now - lastGestureAt.current < 650) return;
    const maxAxis = Math.max(Math.abs(calibrated.x), Math.abs(calibrated.y), Math.abs(calibrated.z));
    if (maxAxis < 0.55) gestureArmed.current = true;
    if (!gestureArmed.current) return;
    let detected: Gesture | null = null;
    if (resultant > 7) detected = "shake";
    else if (Math.abs(calibrated.x) > Math.abs(calibrated.y) && Math.abs(calibrated.x) > 1.8) detected = calibrated.x > 0 ? "right" : "left";
    else if (Math.abs(calibrated.y) > 1.8) detected = calibrated.y > 0 ? "down" : "up";
    if (detected) {
      lastGestureAt.current = now;
      gestureArmed.current = false;
      const gesture = detected;
      const dispatch = window.setTimeout(() => registerGesture(gesture), 0);
      return () => window.clearTimeout(dispatch);
    }
  }, [calibrated.x, calibrated.y, calibrated.z, completed, expected, isLive, playing, registerGesture, resultant]);

  useEffect(() => {
    if (isLive) return;
    const onKey = (event: KeyboardEvent) => {
      const keyMap: Record<string, Gesture> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", " ": "shake" };
      const gesture = keyMap[event.key];
      if (gesture) registerGesture(gesture);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLive, registerGesture]);

  const startRound = () => {
    setSequenceIndex(0);
    setSeconds(current.seconds);
    setCompleted(false);
    setFeedback("ทำตามภาพใหญ่ได้เลย!");
    lastGestureAt.current = Date.now();
    gestureArmed.current = true;
    setPlaying(true);
  };
  const handleSetZero = () => setZeroOffset({ x: raw.x, y: raw.y, z: raw.z });
  const completion = (sequenceIndex / current.sequence.length) * 100;

  return (
    <div className="motion-page copy-page">
      <section className="motion-main-card copy-main-card">
        <div className="mission-topline">
          <span>ทำท่าตามฉัน · ด่าน {level + 1}</span>
          <GuideDialog kind="acceleration" />
        </div>
        <LevelRail level={level} onLevel={chooseLevel} />
        <div className="motion-heading">
          <div><p>{current.en}</p><h2>{current.name}</h2></div>
          <div className={`code-timer ${seconds <= 5 ? "danger" : ""}`}><span>{seconds}</span><small>วินาที</small></div>
        </div>
        <p className="mission-instruction">ภารกิจ: <b>{current.objective}</b></p>

        <div className={`copy-stage ${completed ? "is-complete" : ""}`}>
          <span className="copy-kicker">{completed ? "COMPLETE" : playing ? `ท่าที่ ${sequenceIndex + 1} จาก ${current.sequence.length}` : "พร้อมหรือยัง?"}</span>
          <strong className="move-cue">{completed ? "🏆" : playing ? GESTURE_META[expected].symbol : "🙌"}</strong>
          <h3>{completed ? "ทำได้แล้ว!" : playing ? GESTURE_META[expected].label : "กดเริ่ม แล้วทำตามฉัน"}</h3>
          <p aria-live="polite">{feedback}</p>
          <div className="move-dots" aria-label="ความคืบหน้าของท่าทาง">
            {current.sequence.map((gesture, index) => <i key={`${gesture}-${index}`} className={index < sequenceIndex ? "done" : index === sequenceIndex && playing ? "active" : ""} />)}
          </div>
          <div className="copy-progress"><Progress value={completion} /><b>{sequenceIndex}/{current.sequence.length}</b></div>
        </div>

        <div className="motion-actions">
          <div className="attempts">ทำผิด {Math.min(attempts, 3)}/3</div>
          <Button variant="outline" onClick={handleSetZero}><RotateCcw /> Set zero acceleration</Button>
          {completed ? (
            <Button className="success-button" onClick={() => chooseLevel(Math.min(level + 1, 4))} disabled={level === 4}>
              <Trophy /> {level === 4 ? "ผ่านครบ 5 ด่านแล้ว" : "ไปด่านถัดไป"}
            </Button>
          ) : (
            <Button onClick={startRound}>{playing ? "เริ่มใหม่" : "เริ่มทำท่า"}</Button>
          )}
        </div>
        {attempts >= 3 && !completed && <div className="solution-box"><Zap /> คำใบ้: <b>ดูเฉพาะท่าที่กำลังแสดง แล้วค่อยทำทีละท่า</b></div>}
      </section>

      <aside className="motion-controls-card">
        <div className="metric-grid">
          {(["x", "y", "z"] as const).map((axis) => (
            <div className={`axis-metric axis-${axis}`} key={axis}><span>{axis.toUpperCase()}</span><strong>{formatValue(calibrated[axis])}</strong><small>m/s²</small></div>
          ))}
          <div className="axis-metric axis-r"><span>R</span><strong>{formatValue(resultant)}</strong><small>m/s²</small></div>
        </div>

        {!isLive && (
          <div className="gesture-simulator">
            <p><Gamepad2 /> ลองเล่นโดยไม่ต่อเซนเซอร์</p>
            <div className="gesture-buttons">
              {(Object.keys(GESTURE_META) as Gesture[]).map((gesture) => (
                <Button key={gesture} variant="outline" onClick={() => registerGesture(gesture)} disabled={!playing}>
                  <span>{GESTURE_META[gesture].symbol}</span>{GESTURE_META[gesture].label}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div className="axis-lesson">
          <strong>เล่นสั้น เข้าใจทันที</strong>
          <p>เด็กเห็นว่าการเอียงอุปกรณ์แต่ละทิศทำให้ค่าความเร่งเปลี่ยน โดยไม่ต้องจำแกนหรืออ่านสูตรก่อนเล่น</p>
        </div>
        <p className="control-note">{isLive ? "กำลังอ่านท่าทางจาก GDX-ACC" : "ใช้ปุ่มด้านบน หรือปุ่มลูกศร · Space"}</p>
      </aside>
    </div>
  );
}

export function SensorGames() {
  const [activeGame, setActiveGame] = useState<GameKind>("temperature");
  const [transport, setTransport] = useState<Transport>("bluetooth");
  const [demoTemperature, setDemoTemperature] = useState(25);
  const { status, deviceName, error, connectedKind, reading, connect, disconnect } = useGoDirect();
  const isLive = status === "connected" && connectedKind === activeGame;

  const title = useMemo(() => activeGame === "temperature" ? "ภารกิจร้อน–เย็น" : "ทำท่าตามฉัน", [activeGame]);

  return (
    <main className="site-shell">
      <header className="site-header">
        <div className="brand-mark"><span>V</span><div><strong>VERNIER</strong><small>SENSOR QUEST</small></div></div>
        <div className="header-title"><span>LEARN · MOVE · MEASURE</span><h1>{title}</h1></div>
        <div className="header-badge"><Zap /> เล่นกับข้อมูลจริง</div>
      </header>

      <div className="workspace">
        <Tabs value={activeGame} onValueChange={(value) => setActiveGame(value as GameKind)}>
          <TabsList className="game-tabs">
            <TabsTrigger value="temperature"><Thermometer /> Temperature <span>ภารกิจร้อน–เย็น</span></TabsTrigger>
            <TabsTrigger value="acceleration"><Gamepad2 /> GDX-ACC <span>ทำท่าตามฉัน</span></TabsTrigger>
          </TabsList>

          <ConnectionDock
            activeGame={activeGame}
            status={status}
            deviceName={deviceName}
            error={error}
            connectedKind={connectedKind}
            transport={transport}
            setTransport={setTransport}
            onConnect={() => void connect(activeGame, transport)}
            onDisconnect={() => void disconnect()}
          />

          <TabsContent value="temperature">
            <TemperatureGame value={isLive ? reading.temperature : demoTemperature} isLive={isLive} setDemoValue={setDemoTemperature} />
          </TabsContent>
          <TabsContent value="acceleration">
            <CopyMoveGame reading={reading} isLive={isLive} />
          </TabsContent>
        </Tabs>
      </div>

      <footer><span>Educational sensor games for Vernier Go Direct®</span><span>ใช้เพื่อการเรียนรู้และการทดลองในชั้นเรียน</span></footer>
    </main>
  );
}
