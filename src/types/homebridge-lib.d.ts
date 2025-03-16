declare module 'homebridge-lib/lib/EveHomeKitTypes.js' {
  import { API, Service, Characteristic } from 'homebridge';

  export class EveHomeKitTypes {
    constructor(api: API);
    Services: { [key: string]: typeof Service };
    Characteristics: { [key: string]: typeof Characteristic };
  }
} 