import asyncio
import json
import websockets


async def test():
    try:
        async with websockets.connect("ws://localhost:8000/ws/solve") as ws:
            # Test with garbled/empty OCR output that Tesseract might produce
            tests = [
                {"type": "solve_text", "text": ""},
                {"type": "solve_text", "text": "   "},
                {"type": "solve_text", "text": "l"},
                {"type": "solve_text", "text": "||"},
                {"type": "solve_text", "text": "O"},
                {"type": "solve_text", "text": "1O"},
                {"type": "solve_text", "text": "x2+"},
                {"type": "solve_text", "text": "2x+3"},
                {"type": "solve_text", "text": "sqrt(4)"},
            ]

            for msg in tests:
                print(f"Sending: {json.dumps(msg)}")
                try:
                    await ws.send(json.dumps(msg))
                    resp = await asyncio.wait_for(ws.recv(), timeout=5)
                    data = json.loads(resp)
                    print(f"  -> type={data.get('type')}, answer={data.get('answerText', data.get('message', 'N/A'))}")
                except asyncio.TimeoutError:
                    print(f"  -> TIMEOUT (no response)")
                except websockets.exceptions.ConnectionClosed as e:
                    print(f"  -> CONNECTION CLOSED: {e}")
                    # Reconnect for next test
                    ws = await websockets.connect("ws://localhost:8000/ws/solve")
                except Exception as e:
                    print(f"  -> ERROR: {type(e).__name__}: {e}")
                print()

    except Exception as e:
        print(f"FATAL: {type(e).__name__}: {e}")


asyncio.run(test())
