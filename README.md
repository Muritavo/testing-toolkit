# Introduction

This is a generalization of the functions used for @muritavo/cypress-toolkit so they can be used with other testing frameworks (like jest for example)

# Folder structure

There are 2 main folders where the source is located:
/native - These are pure nodejs based implementations, that require interfacing with nodejs native libraries (e.g. child_process)
/client - These are implementations that can be used on jsdom or nodejs and (usually) don't require env specific libraries