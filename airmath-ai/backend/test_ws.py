import asyncio
import json
import websockets


async def test():
    try:
        async with websockets.connect("ws://localhost:8000/ws/solve") as ws:
            # Test 1: Simple arithmetic
            msg = {"type": "solve_text", "text": "2 + 3"}
            print(f"Sending: {json.dumps(msg)}")
            await ws.send(json.dumps(msg))
            resp = await asyncio.wait_for(ws.recv(), timeout=5)
            data = json.loads(resp)
            print(f"Response: {json.dumps(data, indent=2)}")
            print()

            # Test 2: Equation
            msg2 = {"type": "solve_text", "text": "x + 2 = 5"}
            print(f"Sending: {json.dumps(msg2)}")
            await ws.send(json.dumps(msg2))
            resp2 = await asyncio.wait_for(ws.recv(), timeout=5)
            data2 = json.loads(resp2)
            print(f"Response: {json.dumps(data2, indent=2)}")
            print()

            # Test 3: Typical Tesseract output (might have extra spaces/newlines)
            msg3 = {"type": "solve_text", "text": "  3 * 4  "}
            print(f"Sending: {json.dumps(msg3)}")
            await ws.send(json.dumps(msg3))
            resp3 = await asyncio.wait_for(ws.recv(), timeout=5)
            data3 = json.loads(resp3)
            print(f"Response: {json.dumps(data3, indent=2)}")

    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}")


asyncio.run(test())
