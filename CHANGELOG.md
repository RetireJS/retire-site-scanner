# Changelog

## 1.7.4

* Dependency updates

## 1.7.3

### Bugfix

* Deduplicate vulnerabilities in CycloneDX output — advisories with the same ID are now merged into a single entry, with all affected components listed in the `affects` array

## 1.7.2

### Bugfix

* Fix URL argument parsing when `--header`, `--cookies`, or `--sbom-file` values were present
* Fix missing request-level error handler when downloading the retire.js vulnerability database
* Fix HTTP/1.1 response stream errors leaving the promise permanently pending
* Fix HTTP/2 race condition where concurrent requests to the same origin fired on a not-yet-connected session

## 1.7.1

### Bugfix

* Various smaller bugs

## 1.7.0

### Enhancement

* Add `--sbom-file` argument to write SBOM output to a file

## 1.6.5

### Bugfix

* Fix group vs name for scoped names in CycloneDX output

## 1.6.4

### Improvements

* Add dependencies to CycloneDX


### Bugfix

* Try to fix download speed for source maps

## 1.6.3

### Bugfix

* Fix encoding of PURLs in SBOM output

## 1.6.2

### Bugfix

* Add missing CWEs in SBOM output

## 1.6.1

### Bugfix

* Broken references in SBOM output

## 1.6.0

### Enhancement

* Include licenses in SBOM output

## 1.5.0

### Enhancement

* Improve CycloneDX vulnerability IDs

## 1.4.1

### Bugfix 

* Fix bug related to deepscans in retire.js

## 1.4.0

* Add purl to SBOM output

## 1.3.0

* Add support for color output via --color
* Move parsing errors for deepscan to debug

## 1.2.0

Add support for detecting the use of known bad CDNs.

## 1.1.1

Add file name scanning

## 1.1.0

Add AST scanning

## 1.0.5

Add support for .js.LICENSE.txt 

## 1.0.4

Renaming repository from retire-scanner to retire-site-scanner as name was taken


## 1.0.3

Renaming from retire-scanner to retire-site-scanner as name was taken

## 1.0.2

Fixing build script

## 1.0.1

Fixing build script

## 1.0.0

Initial version