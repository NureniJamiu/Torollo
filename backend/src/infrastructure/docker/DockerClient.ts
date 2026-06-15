import Docker from 'dockerode';
import { ENV } from '../../config/env';

const docker = new Docker();

export default docker;
