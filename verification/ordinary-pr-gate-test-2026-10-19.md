# Ordinary PR gate detection test

Temporary isolated verification artifact. This file is not application code and is not intended for merge. It tests whether the required owner-approval gate is automatically scheduled on a fresh ordinary pull request before the gate workflow is installed on `main`.

Retest after installing the owner approval gate on `main`: this ordinary PR still has no SHA-bound owner authorization review, so the required gate should run and fail closed.
