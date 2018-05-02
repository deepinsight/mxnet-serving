#!/bin/sh

rm -f log
rm -rf output
jmeter -n -t test-plan.jmx -e -l log -o output
