import {exec} from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import _ from 'lodash'
import path from "path"
import {digraph, toDot} from 'ts-graphviz'
import {Declaration, NamedImport, TypescriptParser} from 'typescript-parser'

function* findAllTypescriptFiles(dir: string): Generator<string> {
    const files = fs.readdirSync(dir, {withFileTypes: true})
    for (const file of files) {
        if (file.isDirectory()) {
            yield* findAllTypescriptFiles(path.join(dir, file.name))
        } else {
            if (file.name.endsWith('.ts')) {
                yield path.join(dir, file.name)
            }
        }
    }
}

function strToColor(str: string) {
    const s = crypto.createHash('md5').update(str).digest('hex')
    return `#${s.substr(0, 6)}`
}

async function analyzeFile(
    file: string,
    declarations: Declaration[],
    exceptions: string[],
    modulesByDeclaration: Record<string, Array<string>>,
) {
    {
        const parser = new TypescriptParser()

        const tsFile = await parser.parseFile(file, '.')

        for (const declaration of declarations) {
            const declarationName = declaration.name
            for (const importRecord of tsFile.imports) {
                const namedImport = importRecord as NamedImport
                if (!namedImport) {
                    continue
                }
                if (
                    namedImport.specifiers &&
                    _.find(namedImport.specifiers, x => x.specifier === declarationName)
                ) {
                    if (_.some(exceptions, x => tsFile.filePath.endsWith(x))) {
                        continue
                    }
                    const modulePath = tsFile.filePath.substring(
                        tsFile.filePath.lastIndexOf('/') + 1,
                    )
                    const lookup = modulesByDeclaration[declarationName]
                    if (!lookup) {
                        modulesByDeclaration[declarationName] = [modulePath]
                    } else {
                        lookup.push(modulePath)
                    }
                }
            }
        }
    }
}

function generateGraph(filesByEvent: Record<string, Array<string>>) {
    const options = {compound: true, splines: 'polyline'}
    const graph = digraph('G', options)

    const sg1 = graph.createSubgraph('cluster_0', {label: 'events'})
    const sg2 = sg1.createSubgraph('cluster', {label: 'modules'})
    for (const [eventName, list] of Object.entries(filesByEvent)) {
        const node1 = sg1.createNode(eventName, {
            shape: 'box',
            style: 'filled',
            color: 'orange',
        })

        for (const dep of list) {
            const node2 = sg2.createNode(dep, {shape: 'box'})
            graph.createEdge([node2, node1], {color: strToColor(node2.id)})
        }
    }
    return toDot(graph)
}

export async function analyzeUsage(usageTarget: string, dir: string, exceptions: string[], outputName: string) {
    const parser = new TypescriptParser()
    const eventsExported = await parser.parseFile(usageTarget, '.')

    const modulesByDeclaration: Record<string, Array<string>> = {}
    for (const file of findAllTypescriptFiles(dir)) {
        await analyzeFile(file, eventsExported.declarations, exceptions, modulesByDeclaration)
    }
    const dot = generateGraph(modulesByDeclaration)
    fs.writeFileSync(`${outputName}.dot`, dot)
    exec(`dot -Grankdir=LR -Tpng ${outputName}.dot -o ${outputName}.png`)
}

