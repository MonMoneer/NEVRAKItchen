# NIVRA Kitchen App Test Report

**Date:** 4/1/2026
**Project:** Al Mansouri Kitchen

| Step | What I Wanted To Do | What Actually Happened | Problem |
|------|---------------------|----------------------|----------|
| 1 | Login and open projects | Logged in: false, URL: http://localhost:3000/projects | May not be logged in |
| 1 | Project exists from before | Using existing Al Mansouri Kitchen | OK |
| 2 | Select Draw Wall | Tool selected | OK |
| 2 | Wall 1: RIGHT 450cm | Drew horizontal wall | OK |
| 2 | Wall 2: DOWN 150cm | Drew return wall | OK |
| 2 | Wall 3: LEFT 150cm | Drew | OK |
| 2 | Wall 4: DOWN 130cm | Drew | OK |
| 2 | Wall 5: LEFT 300cm | Drew back wall | OK |
| 2 | Wall 6: UP 280cm close | Drew closing wall | OK |
| 3 | Place door | Clicked bottom wall | OK |
| 4 | Place window | Clicked left wall | OK |
| 5 | Base cab 450cm long wall | Placed | OK |
| 6 | Base cab 150cm return wall | Placed | OK |
| 7 | Tall cab 60cm | Placed | OK |
| 8 | Wall cabs on long wall | Placed | OK |
| 12 | Island 100cm | Placed center | OK |
| 13 | Measure tape | Clicked 2 pts | OK |
| 14 | Check pricing | Pricing | OK |
| 15 | Undo | Pressed Cmd+Z | OK |
| 15 | Redo | Pressed Cmd+Shift+Z | OK |
| 17 | Send to Measurement | URL: http://localhost:3000/projects/5 | OK |
| 19 | Search by name | FOUND | OK |
| 19 | Search by phone | NOT FOUND | Phone search failed |

## Screenshots (21)
- 00_after_login.png
- 00_initial.png
- 00_login_filled.png
- 01_designer.png
- 01_projects.png
- 02_wall1.png
- 02_wall2.png
- 02_walls_done.png
- 03_door.png
- 04_window.png
- 05_base.png
- 06_base_return.png
- 07_tall.png
- 08_wall_cab.png
- 12_island.png
- 13_measure.png
- 14_pricing.png
- 15_undo.png
- 17_measurement.png
- 19_search.png
- 20_final.png
