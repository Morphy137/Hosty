import type { IGameDriver, GameDriverSummary } from './IGameDriver';
import { MinecraftDriver } from './MinecraftDriver';
import { ProjectZomboidDriver } from './ProjectZomboidDriver';
import { HytaleDriver } from './HytaleDriver';

export class GameDriverRegistry {
  private readonly drivers = new Map<string, IGameDriver>();
  private readonly defaultDriverId = 'minecraft';

  constructor() {
    this.register(new MinecraftDriver());
    this.register(new ProjectZomboidDriver());
    this.register(new HytaleDriver());
  }

  public register(driver: IGameDriver): void {
    this.drivers.set(driver.id.toLowerCase(), driver);
  }

  public getDriver(gameId?: string): IGameDriver {
    if (!gameId) {
      return this.drivers.get(this.defaultDriverId)!;
    }
    const found = this.drivers.get(gameId.toLowerCase());
    return found ?? this.drivers.get(this.defaultDriverId)!;
  }

  public hasDriver(gameId: string): boolean {
    return this.drivers.has(gameId.toLowerCase());
  }

  public listDrivers(): GameDriverSummary[] {
    return Array.from(this.drivers.values()).map((d) => d.summary);
  }
}

export const driverRegistry = new GameDriverRegistry();
