// Family filter tests for docker, make, pip — and detection completeness
import { describe, expect, it } from "bun:test";
import { detectFamily } from "@opentoken/core/families/detect";
import { filterDockerOutput } from "@opentoken/core/families/docker";
import { filterMakeOutput } from "@opentoken/core/families/make";
import { filterPipOutput } from "@opentoken/core/families/pip";

describe("Docker Filters", () => {
	it("filters docker build progress lines", () => {
		const input = `#1 [internal] load build definition from Dockerfile
#1 transferring dockerfile: 120B done
#2 [internal] load metadata for docker.io/library/node:18
#2 DONE 0.5s
Successfully built abc123def456
Successfully tagged myapp:latest`;
		const result = filterDockerOutput("docker build -t myapp .", input);
		expect(result).toContain("Successfully built");
		expect(result).toContain("Successfully tagged");
	});

	it("strips docker pull progress lines, keeps errors", () => {
		const input = `Downloading 12345abc...
Extracting 12345abc...
Error: manifest not found`;
		const result = filterDockerOutput("docker pull node:18", input);
		expect(result).toContain("Error: manifest not found");
		expect(result).not.toContain("Downloading");
	});

	it("passes through docker logs unchanged", () => {
		const input =
			"server started on port 3000\nGET / 200 12ms\nPOST /api/data 201 5ms";
		const result = filterDockerOutput("docker logs myapp", input);
		expect(result).toBe(input);
	});

	it("returns compressed message when all output stripped", () => {
		const input = "#1 DONE\n#2 DONE\n";
		const result = filterDockerOutput("docker build .", input);
		expect(result).toContain("all layers cached");
	});
});

describe("Make Filters", () => {
	it("folds make progress lines without warnings", () => {
		const input = `[ 10%] Building CXX object foo.cc.o
[ 20%] Building CXX object bar.cc.o
[100%] Linking target myapp
Build complete`;
		const result = filterMakeOutput("make", input);
		expect(result).not.toContain("[ 10%]");
		expect(result).not.toContain("[100%]");
		expect(result).toContain("Build complete");
	});

	it("keeps progress lines adjacent to warnings", () => {
		const input = `[ 10%] Building CXX object foo.cc.o
warning: unused variable 'x'
[ 20%] Building CXX object bar.cc.o
[100%] Linking target myapp`;
		const result = filterMakeOutput("make", input);
		expect(result).toContain("[ 10%]");
		expect(result).toContain("warning: unused variable 'x'");
		expect(result).toContain("[ 20%]");
		// [100%] has no adjacent warning — gets stripped
		expect(result).not.toContain("[100%]");
	});

	it("passes through cmake output when no progress lines", () => {
		const input =
			"Configuring done\nGenerating done\nBuild files have been written";
		const result = filterMakeOutput("cmake ..", input);
		expect(result).toBe(input);
	});

	it("returns compressed message when all progress lines stripped", () => {
		const input = `[  1%] Building
[100%] Done`;
		const result = filterMakeOutput("make", input);
		expect(result).toContain("no warnings or errors");
	});
});

describe("Pip Filters", () => {
	it("folds repeated 'Requirement already satisfied' lines", () => {
		const input = `Requirement already satisfied: numpy in /usr/lib/python3
Requirement already satisfied: pandas in /usr/lib/python3
Requirement already satisfied: scipy in /usr/lib/python3
Successfully installed mypackage-1.0.0`;
		const result = filterPipOutput("pip install mypackage", input);
		expect(result).not.toContain("Requirement already satisfied: numpy");
		expect(result).toContain("... 3 requirements already satisfied");
		expect(result).toContain("Successfully installed");
	});

	it("passes through pip list output unchanged", () => {
		const input = "numpy 1.24.0\npandas 2.0.0\nscipy 1.10.0";
		const result = filterPipOutput("pip list", input);
		expect(result).toBe(input);
	});

	it("preserves errors through folding", () => {
		const input = `Collecting somepackage
  Downloading somepackage-1.0.tar.gz
ERROR: Could not install somepackage
WARNING: Dependency conflict detected`;
		const result = filterPipOutput("pip install somepackage", input);
		expect(result).toContain("ERROR: Could not install somepackage");
		expect(result).toContain("WARNING: Dependency conflict detected");
	});
});

describe("Family Detection Completeness", () => {
	it("detects docker", () => {
		expect(detectFamily("docker build .")).toBe("docker");
		expect(detectFamily("docker pull node")).toBe("docker");
		expect(detectFamily("docker push myapp")).toBe("docker");
	});

	it("detects make", () => {
		expect(detectFamily("make")).toBe("make");
		expect(detectFamily("cmake ..")).toBe("make");
	});

	it("detects pip", () => {
		expect(detectFamily("pip install numpy")).toBe("pip");
		expect(detectFamily("pipx run cowsay")).toBe("pip");
	});

	it("detects all expected families without collision", () => {
		expect(detectFamily("git status")).toBe("git");
		expect(detectFamily("npm install")).toBe("npm");
		expect(detectFamily("cargo build")).toBe("cargo");
		expect(detectFamily("pytest")).toBe("test");
		expect(detectFamily("ls -la")).toBe("fs");
		expect(detectFamily("echo hello")).toBe("generic");
	});
});
