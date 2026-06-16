import { spawn } from 'child_process';
import path from 'path';
import docker from './DockerClient';

/**
 * Service to manage Docker images required for student workspaces.
 */
export class ImageManager {
  public static readonly UBUNTU_IMAGE_TAG = 'backend-lab-ubuntu:latest';
  private static isBuilding = false;
  private static buildPromise: Promise<void> | null = null;

  /**
   * Checks if the required Ubuntu node image exists. If not, automatically
   * builds it using a singleton promise lock to prevent concurrent builds.
   */
  public static async ensureUbuntuImageExists(): Promise<void> {
    const exists = await this.imageExists(this.UBUNTU_IMAGE_TAG);
    if (exists) {
      return;
    }

    // Lock build process if already running
    if (this.isBuilding && this.buildPromise) {
      console.log(`[ImageManager] Image build for "${this.UBUNTU_IMAGE_TAG}" is already in progress. Awaiting completion...`);
      return this.buildPromise;
    }

    this.isBuilding = true;
    this.buildPromise = this.buildImage();

    try {
      await this.buildPromise;
    } finally {
      this.isBuilding = false;
      this.buildPromise = null;
    }
  }

  /**
   * Helper to check if a specific image tag exists locally in the Docker daemon.
   */
  private static async imageExists(tag: string): Promise<boolean> {
    try {
      const images = await docker.listImages();
      return images.some(img =>
        img.RepoTags && img.RepoTags.includes(tag)
      );
    } catch (err) {
      console.error('[ImageManager] Failed to query local docker images:', err);
      return false;
    }
  }

  /**
   * Spawns a docker build child process to build the custom image.
   */
  private static buildImage(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[ImageManager] Starting automatic build of "${this.UBUNTU_IMAGE_TAG}"...`);

      // Resolves to backend/docker/ubuntu-node relative to backend/src/infrastructure/docker
      const contextDir = path.resolve(__dirname, '../../../docker/ubuntu-node');
      const dockerfilePath = path.join(contextDir, 'Dockerfile');

      console.log(`[ImageManager] Build context: ${contextDir}`);
      console.log(`[ImageManager] Dockerfile path: ${dockerfilePath}`);

      const child = spawn('docker', [
        'build',
        '-t',
        this.UBUNTU_IMAGE_TAG,
        '-f',
        dockerfilePath,
        contextDir
      ]);

      child.stdout.on('data', (data) => {
        process.stdout.write(`[docker-build] ${data}`);
      });

      child.stderr.on('data', (data) => {
        process.stderr.write(`[docker-build-err] ${data}`);
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log(`[ImageManager] Successfully built and tagged "${this.UBUNTU_IMAGE_TAG}"`);
          resolve();
        } else {
          reject(new Error(`Docker build process exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to start docker build process: ${err.message}`));
      });
    });
  }
}
