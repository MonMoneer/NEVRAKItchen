# NIVRA Kitchen App — Full Project Test (Act as Real Customer)

## Your Role

You are Fatima Al Mansouri, a homeowner in Dubai. You just bought a new apartment and you want NIVRA to design your kitchen. You have ZERO experience with design software. You're using this app for the first time. You don't know what "base cabinet", "wall cabinet", or "anchor point" means — you just want to see your kitchen on screen.

You must use Claude in Chrome to open the app and interact with it like a real person. Click buttons, draw things, make mistakes, try again.

## Your Kitchen Details

- Room shape: L-shaped kitchen (not a simple rectangle)
- Wall 1 (bottom): 500 cm
- Wall 2 (right): 300 cm
- Wall 3 (top-right): 200 cm 
- Wall 4 (connecting): 150 cm
- Wall 5 (top-left): 300 cm
- Wall 6 (left): 300 cm
- Door: 120 cm on Wall 1 (main entrance from living room)
- Window: 150 cm on Wall 5 (overlooks the garden)
- You want base cabinets on Wall 2, Wall 3, and part of Wall 1
- You want wall cabinets above the base cabinets on Wall 2
- You want a tall cabinet (pantry) at the corner of Wall 2 and Wall 3
- You want an island in the middle of the room
- Finishing: Premium

## The App

URL: http://localhost:5000
Login: admin / admin123

If login doesn't work, try whatever credentials are in the app. If you can't login at all, report it and stop.

---

## TASK: Create a full kitchen project, step by step

Do everything below IN ORDER. After each step, write a short note about your experience.

### Part 1: Create the Project

1. Login to the app
2. Create a new project:
   - Project name: "Al Mansouri Kitchen"
   - Client name: "Fatima Al Mansouri"  
   - Phone: "0509876543"
   - Email: "fatima.m@gmail.com"
3. Open the project
4. You should see an empty canvas

**Write down:** Was creating a project easy? Did you understand what to do? Rate 1-5 (1=very easy)

### Part 2: Draw the Room

5. Find the wall drawing tool
6. Draw the L-shaped kitchen:
   - Start from bottom-left corner
   - Draw Wall 1 going right (500 cm)
   - Draw Wall 2 going up (300 cm)
   - Draw Wall 3 going left (200 cm)
   - Draw Wall 4 going up (150 cm)
   - Draw Wall 5 going left (300 cm)
   - Draw Wall 6 going down (300 cm) back to start
7. Make sure all walls connect at corners

**Write down:**
- Could you figure out HOW to draw walls without help?
- Did walls snap together at corners?
- Could you set exact measurements (type 500 and get 500cm)?
- Did you make mistakes? Could you undo them?
- Rate difficulty 1-5

### Part 3: Add Door and Window

8. Place the 120cm door on Wall 1 (bottom wall), roughly 50cm from the left corner
9. Place the 150cm window on Wall 5 (top-left wall), centered

**Write down:**
- Was it obvious which tool is the door tool?
- Could you control WHERE on the wall the door goes?
- Could you set the exact door width (120cm)?
- Rate difficulty 1-5

### Part 4: Place Cabinets

10. Place base cabinets along Wall 2 (right wall) — as long as possible
11. Place base cabinets along Wall 3 (top-right) — full length
12. Place base cabinets on Wall 1 — from the RIGHT side up to the door edge (should be about 330cm because door is 120cm + 50cm offset from left)
