# NIVRA Kitchen App — Full Customer Simulation Test

## Who You Are

You are **Fatima Al Rashid**, a homeowner in Dubai. You just bought a new apartment and you want NIVRA to design your kitchen. You have ZERO knowledge about design software, AutoCAD, or 2D drawing. You just want to see your kitchen layout and get a price.

You are testing this app as if you walked into NIVRA's showroom and the salesperson handed you a tablet and said "let me show you your kitchen design."

## Your Kitchen Details

Use these REAL measurements for your project:

**Client Info:**
- Name: Fatima Al Rashid
- Phone: 050-987-6543
- Email: fatima.alrashid@gmail.com
- Address: Marina Vista Tower, Apt 1204, Dubai Marina

**Kitchen Room:**
- Shape: L-shaped kitchen
- Wall A (bottom): 400cm long
- Wall B (right): 300cm long  
- Wall C (top-right): 200cm long
- Wall D (connecting back): 100cm long
- Wall E (top-left): 200cm long
- Wall F (left): 300cm long

**Door:**
- Location: on Wall A, starting 50cm from the left corner
- Width: 120cm

**Window:**
- Location: on Wall B, starting 80cm from bottom corner
- Width: 150cm

**Cabinets needed:**
- Base cabinet on Wall A: from door end edge to the right corner (should be ~230cm)
- Base cabinet on Wall C: full wall (200cm)
- Base cabinet on Wall E: full wall (200cm)  
- Tall cabinet (fridge spot): on Wall A, right corner, 70cm wide
- Wall cabinet above base on Wall C: 200cm (same as base below)
- Wall cabinet above base on Wall E: 150cm (leaving 50cm gap)
- Island cabinet: in the middle of the L-shape, 120cm x 90cm

**Electrical points (for site measurement stage):**
- Double socket behind fridge (tall cabinet area), 30cm from corner, 100cm height
- Double socket on Wall C, 50cm from left, 110cm height  
- Light switch on Wall A near door, 20cm from door edge, 120cm height

**Plumbing:**
- Water inlet on Wall E, 100cm from left corner, 80cm height (for sink)
- Drain point on Wall E, 100cm from left corner, 0cm height (under sink)

---

## Your Task — Do Everything a Real Customer Would Do

Open the app in Chrome. Go through ALL of these steps like a real person would. Don't skip anything. If something is confusing, write it down. If something breaks, write it down. Take a screenshot of every major step.

### STEP 1: Login and Create Project (2 min)

1. Open the app URL in Chrome
2. Login (use whatever credentials are available)
3. Create a new project with Fatima's info (name, phone, email, address)
4. You should land on the project page with a canvas

**Write down:**
- Was login easy? Any confusion?
- Did the project create successfully?
- What do you see on screen?

### STEP 2: Draw the L-shaped Kitchen Walls (10 min)

Draw the 6 walls to form the L-shape:
1. Start from bottom-left corner → draw Wall A (400cm) going right
2. From that corner → draw Wall B (300cm) going up
3. From that corner → draw Wall C (200cm) going left
4. From that corner → draw Wall D (100cm) going down
5. From that corner → draw Wall E (200cm) going left
6. From that corner → draw Wall F (300cm) going down back to start

Use the dimension input to type exact measurements. Hold Shift for straight walls.

**Write down:**
- Could you figure out how to select the Wall tool?
- Could you type exact measurements?
- Did the walls connect at corners?
- Did Shift key work for straight lines?
- Does the room shape look correct?
- Any confusion at all?
- Take SCREENSHOT of the completed room

### STEP 3: Place the Door (5 min)

1. Select the Door tool
2. Click on Wall A (the bottom wall)
3. Set the start position: 50cm from the left corner
4. Set the door width: 120cm

**Write down:**
- How did you set the start position? Drag or type?
- Could you type 50cm offset?
- Could you type 120cm width?
- Does the door look correct on the wall?
- Take SCREENSHOT

### STEP 4: Place the Window (5 min)

1. Select Window tool
2. Click on Wall B (the right wall)
3. Set start: 80cm from bottom corner
4. Set width: 150cm

**Write down:**
- Same questions as door
- Take SCREENSHOT

### STEP 5: Place Base Cabinets (15 min)

This is the most important test. Go slowly.

**Cabinet 1 — Base on Wall A (after door):**
1. Select Base Cabinet tool
2. Hover Wall A — do you see anchor points? (dots at corners, door edges)
3. Click on the DOOR END EDGE (right side of the door)
4. The cabinet should start RIGHT at the door edge with ZERO gap
5. Set length: draw toward the right corner (~230cm)

**CRITICAL CHECK:** Is there any gap between the door edge and cabinet start? If YES = BUG.
**CRITICAL CHECK:** Does the cabinet sit INSIDE the room or overlap into the wall? If overlap = BUG.

**Cabinet 2 — Base on Wall C (full wall):**
1. Click on Wall C
2. Start from left corner, draw full 200cm

**Cabinet 3 — Base on Wall E (full wall):**
1. Click on Wall E  
2. Start from left corner, draw full 200cm

**Cabinet 4 — Tall cabinet (fridge) on Wall A right corner:**
1. Select Tall Cabinet tool
2. Click on Wall A near the right corner
3. Set width: 70cm
4. This should be a PURPLE cabinet

**CRITICAL CHECK:** If the tall cabinet overlaps with Base Cabinet 1, the base should AUTO-SPLIT. Did it split?

**Write down for ALL cabinets:**
- Could you figure out HOW to place a cabinet? Was it obvious?
- Did direction change freely when you moved mouse? Or did it lock?
- Did measurements make sense?
- Could you type exact lengths?
- Take SCREENSHOT of all base cabinets placed

### STEP 6: Place Wall Cabinets (5 min)

**Wall cabinet on Wall C (200cm):**
1. Select Wall Cabinet tool
2. Place on Wall C, full width 200cm
3. Should be GREEN and thinner than base

**Wall cabinet on Wall E (150cm, leaving 50cm gap):**
1. Place on Wall E, 150cm from left corner

**CRITICAL CHECK:** Try placing a wall cabinet ON TOP of the existing wall cabinet on Wall C. Does the system BLOCK it with error? If it allows overlap = BUG.

**Write down:**
- Did wall cabinets appear above the base cabinets correctly?
- Take SCREENSHOT

### STEP 7: Place Island Cabinet (5 min)

1. Select Island tool
2. Click in the middle of the L-shape open area
3. Set length: 120cm, depth: 90cm
4. Should be YELLOW

**Write down:**
- Was island placement intuitive?
- Could you set both length and depth?
- Take SCREENSHOT

### STEP 8: Check Pricing (3 min)

1. Look for the pricing panel (usually on the right side)
2. Does it show each cabinet type with a price?
3. Change the finishing option from "Standard" to "Premium"
4. Does the total price change?

**Write down:**
- Is the pricing clear and readable?
- Does the math look correct? (length x price x multiplier)
- Take SCREENSHOT of pricing

### STEP 9: Use Measure Tape (3 min)

1. Find the Measure Tape tool
2. Click two points in the room to measure a distance
3. Does it show the measurement?
4. Try chaining: after the first measurement, click another point

**Write down:**
- Was the tool easy to find and use?

### STEP 10: Test Undo/Redo and Edit (3 min)

1. Select a cabinet and press F — does depth flip?
2. Press Ctrl+Z three times — do last 3 actions undo?
3. Press Ctrl+Y — does it redo?
4. Select a cabinet and press Delete — does it delete?

**Write down:**
- Did all keyboard shortcuts work?

### STEP 11: Export PDF (3 min)

1. Find the Export/Download button
2. Click it to generate PDF
3. Check: does the PDF include NIVRA letterhead, layout image, cabinet list, pricing?

**Write down:**
- Did the PDF generate?
- Does it look professional enough to send to a client?
- Take SCREENSHOT of the PDF

### STEP 12: Advance to Site Measurement (5 min)

1. Find the "Advance to Site Measurement" button
2. Click it
3. The canvas should now show a LOCKED SCREENSHOT of your design
4. You should see a banner: "Site Measurement Mode"
5. Try to draw a wall — it should be BLOCKED
6. Try to add a cabinet — it should be BLOCKED

**Write down:**
- Did the reference image appear?
- Is the design locked?
- Can you still see the room layout clearly?

### STEP 13: Place Electrical & Plumbing Points (10 min)

Now you are the technician at Fatima's apartment doing measurements.

**Electrical point 1 — behind fridge:**
1. Select Electrical tool
2. Place on the wall near the tall cabinet (fridge area)
3. Set: distance 30cm from corner, height 100cm
4. Add note: "Double socket for fridge"

**Electrical point 2 — on Wall C:**
1. Place on Wall C
2. Distance: 50cm from left, height: 110cm
3. Note: "Double socket for countertop appliances"

**Electrical point 3 — light switch near door:**
1. Place near door on Wall A
2. Distance: 20cm from door edge, height: 120cm
3. Note: "Kitchen light switch"

**Plumbing point 1 — water inlet:**
1. Select Plumbing tool
2. Place on Wall E, 100cm from left, height: 80cm
3. Note: "Cold/hot water inlet for sink"

**Plumbing point 2 — drain:**
1. Place on Wall E, 100cm from left, height: 0cm
2. Note: "Drain point under sink"

**Write down:**
- Could you place all 5 points?
- Were the distance/height inputs clear?
- Could you add notes?
- Are the points clearly visible on the reference image?
- Take SCREENSHOT of all points placed

### STEP 14: Search and Find Project (2 min)

1. Go back to the projects list
2. Try searching by phone number: "050-987-6543"
3. Does Fatima's project appear?
4. Try searching by name: "Fatima"
5. Does it appear?

**Write down:**
- Does search work?

---

## REPORT FORMAT

After completing ALL steps, create a detailed report saved as **NIVRA_Customer_Test_Report.md** in the project folder. Use this format:

### Project Summary
- Project: Fatima Al Rashid Kitchen
- Total steps attempted: 14
- Steps completed successfully: X/14
- Steps with issues: X/14

### Screenshots
List all screenshots taken with descriptions

### Critical Bugs Found (MUST FIX before launch)
For each bug:
- Step number and description
- What happened vs what should happen
- Severity: CRITICAL / HIGH / MEDIUM / LOW

### UX Confusion Points (user got stuck or confused)
For each issue:
- Step number
- What was confusing
- Suggested improvement

### What Worked Great
List everything that felt natural and easy

### Measurements Accuracy Check
- Wall A intended: 400cm → actual displayed: ___cm
- Door intended: 120cm → actual displayed: ___cm  
- Base cabinet 1 intended: ~230cm → actual displayed: ___cm
- (check all measurements match what was intended)

### Pricing Verification
- Base cabinets total length: ___m  
- Wall cabinets total length: ___m
- Tall cabinets total length: ___m
- Finishing selected: ___
- Calculated total: ___ AED
- Does it match what the app shows? YES/NO

### Fix Verification (check each specific fix)

| Fix | Test | Result |
|-----|------|--------|
| FIX 1 — Inner face | Cabinet sits inside room, not overlapping wall | PASS/FAIL |
| FIX 1 — Zero gap | Cabinet edge touches door edge perfectly | PASS/FAIL |
| FIX 2 — Direction | Mouse freely changes cabinet direction | PASS/FAIL |
| FIX 3 — Anchors | Anchor markers visible on wall hover | PASS/FAIL |
| FIX 3 — Anchors | Can start cabinet from door edge anchor | PASS/FAIL |
| FIX 4 — Clearance | Door blocks exact width only (120cm) | PASS/FAIL |
| FIX 5 — Overlap | Base on base is blocked with error | PASS/FAIL |
| FIX 6 — Site meas | Locked reference image shows | PASS/FAIL |
| FIX 6 — Site meas | Cannot draw walls/cabinets | PASS/FAIL |
| FIX 7 — Ghost | Green preview for valid, red for blocked | PASS/FAIL |
| FIX 8 — Remaining | Shows remaining wall space | PASS/FAIL |

### Overall Score
- Usability: __/10 (could a non-technical person use this?)
- Accuracy: __/10 (are measurements and prices correct?)
- Completeness: __/10 (can you do everything needed for a kitchen design?)
- Bugs: __/10 (10 = no bugs, 1 = unusable)

### Final Verdict
Would you send this to a real customer? YES / NO / NEEDS FIXES FIRST
