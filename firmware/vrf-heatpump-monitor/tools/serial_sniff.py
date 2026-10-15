#!/usr/bin/env python3
"""Dump serial for a few seconds (PlatformIO / diagnostics)."""
import sys
import time

try:
    import serial
except ImportError as e:
    print("serial not installed:", e, file=sys.stderr)
    sys.exit(2)


def main():
    port = sys.argv[1] if len(sys.argv) > 1 else "COM3"
    baud = int(sys.argv[2]) if len(sys.argv) > 2 else 115200
    seconds = float(sys.argv[3]) if len(sys.argv) > 3 else 30.0

    ser = serial.Serial(port, baud, timeout=0.5)
    ser.dtr = False
    ser.rts = False
    time.sleep(0.2)
    ser.reset_input_buffer()
    deadline = time.time() + seconds
    buf = bytearray()
    while time.time() < deadline:
        chunk = ser.read(4096)
        if chunk:
            buf += chunk
    ser.close()

    sys.stdout.buffer.write(bytes(buf))
    sys.stdout.buffer.flush()
    print("\n--- SNIFF END --- bytes=%s" % len(buf), flush=True)


if __name__ == "__main__":
    main()
