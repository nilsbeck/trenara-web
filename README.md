# About

This is a personal project, primarily to learn building a web app with Svelte, TypeScript, and TailwindCSS.
Since I needed something worth working on, I decided to build a new UI for the best running app out there,
[Trenara](https://www.trenara.com). The latest version of the app is always automatically deployed to [https://trenara-web.vercel.app](https://trenara-web-two.vercel.app).

## Goals

- Learn Svelte, TypeScript, and TailwindCSS
- Improve the trenara experience for me (and frankly, any other trenara user)
- Have fun

## What does it do differently?

Currently, trenara is a mobile app for iOS and Android written in Flutter.
It has some drawbacks, that this web app aims to improve and mitigate.

- It is a mobile app only, so it's not accessible from everywhere
  - It is a web app with a responsive design to work on any screensize
- It's loading times are too long. It takes approx. 4-6s to load the main screen and every other screen as well
  - Make the app blazing fast, by running API calls in parallel and caching data. It is surely about 60% faster than the original app.
- It does not give me the information I need at a glance since the dashboard is not informative
  - Make the (monthly!) calendar the center of the app, add goal and prediction data at the same time (on large screens, otherwise accessible via menu)
- Join data that belongs together (training, strength and nutrition details) but is currently split into multiple screens, each needing loading times.
  - Declutter the calendar data, by adding keeping things close but separated by context (using tabs, etc.)
- Remove/hide data that is distracting and not useful for me (graphs that are not useful, etc.)
  - I never needed a map view, or all the other data that trenara shows because I have it in Garmin Connect already. Especially the graph with the paces etc. is unintuitive (at best) to read.

## What is the status?

The app is still under development, but the core functionality is already implemented. It is reading the data from the trenara API, which I had to reverse engineer.
It shows the data for training, strength and nutrition. You can add RPE feedback per training.

## What is the future?

- Implement API calls to
  - ☐ move a training to a different date
  - set training circumstances
  - ✅ delete a training
  - ✅ add manual training
- Refactoring
- Improve dialog usages to change data
- ✅ Remove axios usage in favor of sveltes native fetch API
- Add tests
