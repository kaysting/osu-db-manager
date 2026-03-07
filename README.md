# osu-db-manager

**This project is under early, active development. Below is what this project will ultimately be able to do - not what it can do right now.**

A Node.js library that unifies reading and writing osu! stable and lazer databases with a single API.

- Read active user info like username
- Read installed beatmaps
- Read local scores
- Read and edit collections

This library does not and will not support editing database values that aren't intended to be user-editable, like scores, beatmaps, or other internal values. The primary intent is to read installed beatmaps and allow for collection editing.

Reading stable databases would not be possible without guidance from [this wiki page](https://github.com/ppy/osu/wiki/Legacy-database-file-structure). Thanks peppy <3
