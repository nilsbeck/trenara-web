# About

> **Disclaimer:** Trainara is an **unofficial, unaffiliated third-party client** for Trenara.
> It is not developed, endorsed, sponsored, or supported by Trenara in any way.
> You need a valid Trenara subscription for the official app to use it.
> All trademarks and product names belong to their respective owners.

Trainara is a personal project, primarily to learn building a web app with Svelte, TypeScript, and TailwindCSS.
Since I needed something worth working on, I decided to build a new UI for the best running app out there,
[Trenara](https://www.trenara.com). That client is called **Trainara**. The latest version of the app is always automatically deployed to [https://trenara-web.vercel.app](https://trenara-web-two.vercel.app).

## Goals

- Learn Svelte, TypeScript, and TailwindCSS
- Improve the Trenara experience for me (and frankly, any other trenara user)
- Have fun

## What does it do differently?

Currently, Trenara is a mobile app for iOS and Android written in Flutter.
It has some drawbacks, that this web app aims to improve and mitigate.

- It is a mobile app only, so it's not accessible from everywhere
  - It is a web app with a responsive design to work on any screensize
- It's loading times are too long. It takes approx. 4-6s to load the main screen and every other screen as well
  - Make the app blazing fast, by running API calls in parallel and caching data. It is surely about 60% faster than the original app.
  - Cached data is fetched again only when it is actually out of date — the plan is reworked overnight, and a session you change comes back from the change itself — so a tab opened each morning refreshes once and a tab left open for a week refreshes once a day. When it does refresh, it asks only for the weeks that can still change: a finished week is settled, so late in the month that is two of six, and a month you are browsing in the past costs nothing at all. It happens underneath: the calendar's refresh icon spins, and nothing on screen is taken away until something new has arrived.
- It does not give me the information I need at a glance since the dashboard is not informative
  - Make the (monthly!) calendar the center of the app, add goal and prediction data at the same time (on large screens, otherwise accessible via menu)
- Join data that belongs together (training, strength and nutrition details) but is currently split into multiple screens, each needing loading times.
  - Declutter the calendar data, by adding keeping things close but separated by context (using tabs, etc.)
- Remove/hide data that is distracting and not useful for me (graphs that are not useful, etc.)
  - I never needed a map view, or all the other data that trenara shows because I have it in Garmin Connect already. Especially the graph with the paces etc. is unintuitive (at best) to read.

## What is the status?

The core functionality is implemented. The app signs you in with your own Trenara account and reads
everything from the reverse-engineered Trenara API.

### One design, on every screen

- **A responsive design that works the same way on a phone, a tablet and a large monitor** — the
  same app throughout, laid out for the space it has rather than a desktop page squeezed onto a
  phone or a phone page stretched across a monitor.
- **Functions are grouped by what they mean to a runner, not by which API call they came from.** A
  session's setup arrives as a handful of separate Trenara endpoints; you get one panel. The day's
  training, strength and nutrition are three fetches; you get one day.
- **Fewer clicks, more at your fingertips.** Everything you actually need is on the screen you are
  already on: the settings you can change are chips on the session itself, the ones you have changed
  are marked, and rating, moving or deleting a session never leaves the calendar.

### Your training month

- **A full monthly schedule** as the centre of the app — every week of the month fetched in parallel
  and merged into one calendar, with running, strength and nutrition on the same grid.
- **Training details** per day: the planned blocks, a shape bar of the session, and — once you have
  run it — your actual numbers next to the plan.
- **Strength sessions** with their exercises, and the **nutrition advice** and meal plan for the day,
  in the same place as the training instead of three screens away.
- **An automatic RPE feedback dialog**: a session you have run but not yet rated prompts for it by
  itself, with the details behind it blurred until you do. You can also rate one at any time from
  the training card.
- **Treadmill mode**: the session as step-by-step instructions with the current and next step on
  screen, swipeable, with the speeds in your own units.

### Changing a session

Everything Trenara lets you change about a planned training, gathered into one setup panel. What is
offered is decided by the coach's own flags on that session — options it has locked are simply not
shown.

- **Change the workout session** — swap it for another activity (cycling, mountain biking, indoor
  cycling, swimming, cross trainer, elliptical bike) and back to a run, or exchange it for a
  different session the coach accepts that day.
- **Change intensity, distance and cool-down**, in the steps the coach allows for that session.
- **Change the race pacing plan.**
- **Change the shoes** you will run in, from your locker.
- **Set the terrain**: surface (road, athletics track, treadmill, dirt road, single track), the
  elevation band, and the climb in metres — which is checked against the session distance and tells
  you what that actually reads as per kilometre.
- **Move sessions to another date**, optionally shifting the rest of the plan with them.
- **Delete sessions.**

### Goals and predictions

- **Current race predictions** across distances.
- **Current goal predictions**, with the historic changes recorded over time.
- **10K progress over time** in a chart — the 10K prediction rather than the goal distance, so the
  series stays comparable across training blocks.
- **A goal archive** of everything you have trained for: period, target, final prediction, status.
  (This one may still be buggy.)

### Staying in the loop

- **Chat with Walter**, across threads, with an unread badge on the bubble that clears once you have
  read it.
- **Trenara's in-app news**, with a badge that only ever counts items published since your first
  visit — new content gets noticed, the backlog stays quiet.

## What is the future?

- Improve dialog usages to change data
- Increase test coverage
- Keep the goal archive honest

## Disclaimer

Trainara is an unofficial, unaffiliated third-party client for [Trenara](https://www.trenara.com).
It is not affiliated with, endorsed by, or supported by Trenara. It is not a replacement for the
official app and does not grant access on its own: you need a valid Trenara subscription for the
official app to use it, and you sign in with your own Trenara account. It talks to a reverse-engineered
API and may break at any time. Use it at your own risk. For official support, please use the official
Trenara app.
