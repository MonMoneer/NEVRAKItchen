# NIVRA Kitchen App — Real Customer Test

## BEFORE YOU START

1. Delete ALL old screenshots in the REbilt folder (any .png files from previous tests)
2. Open Chrome and go to http://localhost:3000
3. You will use Claude in Chrome to interact with the app

## Who You Are

You are Fatima. You know NOTHING about design software. You just want to see your kitchen layout and know the price. Think like a normal person, not a robot.

## Your Job

Design a COMPLETE kitchen from start to finish. Do not skip any step. If something is confusing or broken, write it down but keep going. Try to finish the whole kitchen.

---

## PART 1 — Login and Create Project

1. Login to the app (try admin / admin123)
2. Create a new project:
   - Name: "Fatima Kitchen"
   - Client: "Fatima Al Rashid"  
   - Phone: "0509876543"
3. Open the project
4. Take screenshot → name it "01_project_created.png"

---

## PART 2 — Draw the Kitchen Room

You need to draw a simple RECTANGLE kitchen. 4 walls. Not L-shape — just a simple box.

**The room is:**
- 500cm wide (left to right)
- 350cm deep (top to bottom)

**How to draw walls:**
- Select the Wall tool (look for a wall icon or press W)
- Click on the canvas to start the first wall
- Move your mouse to the RIGHT and type 500, press Enter
- The wall should appear. Now WITHOUT clicking the wall tool again, the next wall should start automatically from the end of the first wall
- Move mouse DOWN and type 350, press Enter
- Move mouse LEFT and type 500, press Enter
- Move mouse UP toward the starting point — it should snap and close the room

If walls do NOT chain (each wall stops and you have to restart), that is a BUG. Write it down. But try clicking on the endpoint of the last wall to start the next one manually.

**You MUST end up with 4 connected walls forming a closed rectangle.**

Take screenshot → "02_room_walls.png"

---

## PART 3 — Place a Door

1. Select the Door tool
2. Click on the BOTTOM wall (the 500cm wall)
3. Place a door that is 100cm wide
4. Try to position it about 50cm from the left corner

Take screenshot → "03_door_placed.png"

---

## PART 4 — Place a Window

1. Select the Window tool
2. Click on the RIGHT wall (the 350cm wall)
3. Place a window that is 120cm wide
4. Try to center it on the wall

Take screenshot → "04_window_placed.png"

---
