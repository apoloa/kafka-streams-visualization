interface CurrentGraphNodeNameRef {
  currentGraphNodeName: string;
}

const nameFunction = (value: any) => value.replaceAll('-', '-<br>');

class ColorManager {
  private static pastelColors : string[] = ["#77DD77", "#836953", "#89cff0", "#99c5c4", "#9adedb", "#aa9499", "#aaf0d1", "#b2fba5", "#b39eb5", "#bdb0d0", "#bee7a5", "#befd73", "#c1c6fc", "#c6a4a4", "#cb99c9", "#ff6961", "#ff694f", "#ff9899", "#ffb7ce", "#ca9bf7"];
  private usedColors : string[];

  constructor() {
    this.usedColors = [];
  }

  public getRandomColor(): string {
    const availableColors = ColorManager.pastelColors.filter(color => !this.usedColors.includes(color));
    if (availableColors.length === 0) {
      throw new Error("There are not enough colors.");
    }

    const randomIndex = Math.floor(Math.random() * availableColors.length);
    const randomColor = availableColors[randomIndex];
    this.usedColors.push(randomColor);

    return randomColor;
  }

  public resetColors() {
    this.usedColors = [];
  }

}


class SubTopology {
  public static pattern = /Sub-topology: ([0-9]*)/;
  private static topologyPrefix = "topology";

  private static startFormatter(subTopology: string) {
    return `subgraph ${this.topologyPrefix}${subTopology} [Sub-Topology: ${subTopology}]`;
  }

  private static createClass(subTopology: string, colorManager: ColorManager, classDefList:string[], classList:string[]) {
    const color = colorManager.getRandomColor();
    const classId = `${this.topologyPrefix}${subTopology}`
    classList.push(`class ${classId} fill_${classId}`)
    classDefList.push(`classDef fill_${classId} fill:${color}`)
  }



  public static endFormatter() {
    return `end`;
  };

  public static visit(line: string, subTopologies: string[], subTopologiesList: string[], colorManager: ColorManager, classDefList: string[], classList: string[]): void {
    let match = line.match(this.pattern);
    // Close the previous sub-topology before opening a new one;
    if (subTopologies.length) {
      subTopologies.push(this.endFormatter());
    }
    if (match) {
      subTopologies.push(this.startFormatter(match[1]));
      subTopologiesList.push(match[1]);
      this.createClass(match[1], colorManager, classDefList, classList)
    }
  }
}

class Source {
  public static pattern = /Source:\s+(\S+)\s+\(topics:\s+\[(.*)\]\)/;

  private static formatter(source: string, topic: string) {
    return `${topic}[${topic}] --> ${source}(${nameFunction(source)})`;
  }

  public static visit(line: string, outside: string[], topicSourcesList: string[], ref: CurrentGraphNodeNameRef): void {
    let match = line.match(this.pattern);
    if (match) {
      ref.currentGraphNodeName = match[1].trim();
      let topics = match[2]
      topics.split(',').filter(String).map(topic => topic.trim()).forEach(topic => {
        outside.push(this.formatter(ref.currentGraphNodeName, topic));
        topicSourcesList.push(topic);
      });
    }
  }
}

class Processor {
  public static pattern = /Processor:\s+(\S+)\s+\(stores:\s+\[(.*)\]\)/;

  private static formatter(processor: string, store: string): string {
    return (processor.includes('JOIN')) ? `${store}[(${nameFunction(store)})] --> ${processor}(${nameFunction(processor)})` : `${processor}(${nameFunction(processor)}) --> ${store}[(${nameFunction(store)})]`;
  }

  public static visit(line: string, ref: CurrentGraphNodeNameRef, outside: string[], stateStoresList: string[]): void {
    let match = line.match(this.pattern);
    if (match) {

      ref.currentGraphNodeName = match[1].trim();
      let stores = match[2];
      stores.split(',').filter(String).map(store => store.trim()).forEach(store => {
        outside.push(this.formatter(ref.currentGraphNodeName, store));
        stateStoresList.push(store);
      });
    }
  }
}

class Sink {
  public static pattern = /Sink:\s+(\S+)\s+\(topic:\s+(.*)\)/;

  private static formatter(sink: string, topic: string) {
    return `${sink}(${nameFunction(sink)}) --> ${topic}[${topic}]`;
  }

  public static visit(line: string, ref: CurrentGraphNodeNameRef, outside: string[], topicSinksList: string[]): void {
    let match = line.match(this.pattern);
    if (match) {
      ref.currentGraphNodeName = match[1].trim();
      let topic = match[2].trim();
      outside.push(this.formatter(ref.currentGraphNodeName, topic));
      topicSinksList.push(topic);
    }
  }
}

class RightArrow {
  public static pattern = /\s*-->\s+(.*)/;

  private static formatter(src: string, dst: string) {
    return `${src}(${nameFunction(src)}) --> ${dst}(${nameFunction(dst)})`;
  }

  public static visit(line: string, ref: CurrentGraphNodeNameRef, subTopologies: string[]): void {
    let match = line.match(this.pattern);
    if (match) {
      match[1].split(',').filter(String).map(target => target.trim()).filter(target => target !== 'none').forEach(target => {
        subTopologies.push(this.formatter(ref.currentGraphNodeName, target))
      });
    }
  }
}


export class AsciiToMermaid {

  public static toMermaid(topology: string): string {
    let lines = topology.split('\n');
    let subTopologies: string[] = [];
    let outside: string[] = [];
    let currentGraphNodeName: CurrentGraphNodeNameRef = {currentGraphNodeName: ''};
    let subTopologiesList: string[] = [];
    let topicSourcesList: string[] = [];
    let topicSinksList: string[] = [];
    let stateStoresList: string[] = [];
    let classDefList : string[] = [];
    let classList: string[] = [];
    let colorManager : ColorManager = new ColorManager();


    for (const line of lines) {
      switch (true) {
        case SubTopology.pattern.test(line):
          SubTopology.visit(line, subTopologies, subTopologiesList, colorManager, classDefList, classList);
          break;
        case Source.pattern.test(line):
          Source.visit(line, outside, topicSourcesList, currentGraphNodeName);
          break;
        case Processor.pattern.test(line):
          Processor.visit(line, currentGraphNodeName, outside, stateStoresList);
          break;
        case Sink.pattern.test(line):
          Sink.visit(line, currentGraphNodeName, outside, topicSinksList);
          break;
        case RightArrow.pattern.test(line):
          RightArrow.visit(line, currentGraphNodeName, subTopologies);
          break;
        default:
          break;
      }

    }

    if (subTopologies.length) {
      subTopologies.push(SubTopology.endFormatter());
    }
    let data = ['graph TD'].concat(outside).concat(subTopologies).concat(topicSourcesList).concat(topicSinksList).concat(stateStoresList).concat(classList).concat(classDefList).join('\n');
    console.log(data);
    return data;
  }

}
