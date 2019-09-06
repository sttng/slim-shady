var PxrJSON = {};

var template = document.querySelector('#CustomPxrPatternNode').innerHTML;

var colorSocket = new Rete.Socket("color");
var intSocket = new Rete.Socket("int");
var floatSocket = new Rete.Socket("float");
var normalSocket = new Rete.Socket("normal");
var pointSocket = new Rete.Socket("point");
var stringSocket = new Rete.Socket("string");
var structSocket = new Rete.Socket("struct");
var vectorSocket = new Rete.Socket("vector");

var numSocket = new Rete.Socket("Number");

numSocket.combineWith(colorSocket);
numSocket.combineWith(normalSocket);
numSocket.combineWith(pointSocket);
numSocket.combineWith(vectorSocket);


var VueNumControl = {
  props: ['readonly', 'emitter', 'ikey', 'getData', 'putData'],
  template: '<input type="text" :readonly="readonly" :value="value" @input="change($event)" @dblclick.stop=""/>',
  data() {
    return {
      value: 0,
    }
  },
  methods: {
    change(e){
      this.value = e.target.value;
      this.update();
    },
    update() {
      if (this.ikey)
        this.putData(this.ikey, this.value)
      this.emitter.trigger('process');
    }
  },
  mounted() {
    this.value = this.getData(this.ikey);
  }
}


class NumControl extends Rete.Control {

  constructor(emitter, key, readonly) {
    super(key);
    this.component = VueNumControl;
    this.props = { emitter, ikey: key, readonly };
  }

  setValue(val) {
    this.vueContext.value = val;
  }
}


var CustomPxrXmlArgsSocket = {
  template: `<div class="socket"
    :class="[type, socket.name, used()?'used':''] | kebab"
    :title="socket.name+'\\n'+socket.hint"></div>`,
  props: ['type', 'socket', 'used']
}


var CustomPxrXmlArgsNode = {
	template,
	mixins: [VueRenderPlugin.mixin],
	methods:{
		used(io){
			return io.connections.length;
		}
	},
	components: {
		Socket: /*VueRenderPlugin.Socket*/CustomPxrXmlArgsSocket
	}
}


class PxrXmlArgsComponent extends Rete.Component {
	constructor(PxrPattern) {
		super(PxrPattern);
		this.text = PxrPattern; //PxrCurvature
		this.data.component = CustomPxrXmlArgsNode;
	}

	builder(node) {
		
		var PxrParams
		var PxrOutputs
		var PxrShaderType
		var usedSocket = numSocket
		var xmlDoc
		
		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function() {
			if (xhr.readyState == 4 && xhr.status == 200) {
				var parser = new DOMParser();
				xmlDoc = parser.parseFromString(xhr.responseText, "text/xml");
				PxrParams = xmlDoc.getElementsByTagName("param");
				PxrOutputs = xmlDoc.getElementsByTagName("output");
				PxrShaderType = xmlDoc.getElementsByTagName("shaderType")[0].getElementsByTagName("tag")[0].getAttribute("value")
				PxrShaderType = PxrShaderType[0].toUpperCase() + PxrShaderType.slice(1); //Capitalize 1st letter.
			}
		}
		xhr.open('GET', "https://raw.githubusercontent.com/sttng/LDD/master/args/" + this.text + ".args", false);
		xhr.send();
		
		var oSerializer = new XMLSerializer();
		var stringXML = oSerializer.serializeToString(xmlDoc);
		stringXML = stringXML.replace(/\s+/g, ' '); // Keep only one space character
		stringXML = stringXML.replace(/>\s*/g, '>'); // Remove space after >
		stringXML = stringXML.replace(/\s*</g, '<'); // Remove space before <

		var oParser = new DOMParser();
		xmlDoc = oParser.parseFromString(stringXML, "application/xml");
		
		var jsonText = xmlToJson(xmlDoc);
		var PxrPattern = this.text
		jsonText.PxrPatternName = PxrPattern //A little redundant, but makes it easier later.
		
		// PxrJSON will store all used PxrXmlArgs in a JSON file (for latter vstruct handling)
		PxrJSON[PxrPattern] = jsonText;
		
		// Read shader type (pattern, bxdf, etc) from xml args file and store it in the Rete.js data node
		node.data.PxrShaderType = PxrShaderType;
		
		//Input Nodes (called Params in RenderMan)
		var i
		for (i = 0; i < PxrParams.length; i++) {
			var VstructMember = PxrParams[i].getAttribute("vstructmember");
			var WidgetMember = PxrParams[i].getAttribute("widget");
			
			if (VstructMember) {
				continue; //ignore input nodes which are part of vstructs
			}
			
			var patternType = PxrParams[i].getAttribute("type").replace( /\s/g, '')
			
			if (typeof PxrParams[i].getElementsByTagName("tag")[0] != 'undefined') {
				patternType = PxrParams[i].getElementsByTagName("tag")[0].getAttribute("value")
			}
			
			switch (patternType) {
				case "color":
					usedSocket = colorSocket;
					break;
				case "float":
					usedSocket = floatSocket;
					break;
				case "int":
					usedSocket = intSocket;
					break;
				case "normal":
					usedSocket = normalSocket;
					break;
				case "point":
					usedSocket = pointSocket;
					break;
				case "string":
					usedSocket = stringSocket;
					break;
				case "struct":
					usedSocket = structSocket;
					break;
				case "vector":
					usedSocket = vectorSocket;
					break;
				default:
					usedSocket = numSocket;
			}
			var checkfortags = PxrParams[i].getElementsByTagName("tag");
			
			var PatternInputs = new Rete.Input(patternType + " " + PxrParams[i].getAttribute("name"), patternType + " " + PxrParams[i].getAttribute("name"), usedSocket, true);
			
			if (WidgetMember == "null") {
				//console.log(PxrParams[i])
				PatternInputs.addControl(new NumControl(this.editor, patternType + " " + PxrParams[i].getAttribute("name"), true)); // User disallowed to edit Widget "Null" items 
			}
			
			else {
				PatternInputs.addControl(new NumControl(this.editor, patternType + " " + PxrParams[i].getAttribute("name")));
			}
			node.addInput(PatternInputs)
		}
		
		//Output Nodes
		for (i = 0; i < PxrOutputs.length; i++) {
			var outputTagValue = "";
			var VstructMember = PxrOutputs[i].getAttribute("vstructmember");
			
			if (VstructMember) {
				continue; //ignore output nodes which are part of vstructs
			}
			
			var outputTags = PxrOutputs[i].getElementsByTagName("tag");
				var j
				for (j = 0; j < outputTags.length; j++) {
					outputTagValue += outputTags[j].getAttribute("value") + " ";
			}
			
			switch (outputTagValue.replace( /\s/g, '')) {
				case "color":
					usedSocket = colorSocket;
					break;
				case "float":
					usedSocket = floatSocket;
					break;
				case "int":
					usedSocket = intSocket;
					break;
				case "normal":
					usedSocket = normalSocket;
					break;
				case "point":
					usedSocket = pointSocket;
					break;
				case "string":
					usedSocket = stringSocket;
					break;
				case "struct":
					usedSocket = structSocket;
					break;
				case "vector":
					usedSocket = vectorSocket;
					break;
				default:
					usedSocket = numSocket;
			}
			
			var PatternOutputs = new Rete.Output(PxrOutputs[i].getAttribute("name"), outputTagValue + PxrOutputs[i].getAttribute("name"), usedSocket);
			node.addOutput(PatternOutputs);
		}
	
		return node
	}

	worker(node, inputs, outputs) {
		this.editor.nodes.find(n => n.id == node.id).controls.get('preview').setValue("bla"); //This doesn't work yet. Use it to prefill with default values later
	}
}


(async () => {
	var container = document.querySelector('#rete');

	var PxrXmlArgsList = ["aaOceanPrmanShader",
"OSL Patterns",
"PxrAdjustNormal",
"PxrAttribute",
"PxrBakePointCloud",
"PxrBakeTexture",
"PxrBlackBody",
"PxrBlend",
"PxrBump",
"PxrBumpManifold2D",
"PxrChecker",
"PxrClamp",
"PxrColorCorrect",
"PxrCross",
"PxrCurvature",
"PxrDirt",
"PxrDispScalarLayer",
"PxrDispTransform",
"PxrDispVectorLayer",
"PxrDot",
"PxrExposure",
"PxrFacingRatio",
"PxrFlakes",
"PxrFractal",
"PxrGamma",
"PxrGeometricAOV",
"PxrHairColor",
"PxrHSL",
"PxrInvert",
"PxrLayeredBlend",
"PxrManifold2D",
"PxrManifold3D",
"PxrMatteID",
"PxrMix",
"PxrMultiTexture",
"PxrNormalMap",
"PxrPrimvar",
"PxrProjectionLayer",
"PxrProjectionStack",
"PxrProjector",
"PxrPtexture",
"PxrRamp",
"PxrRandomTextureManifold",
"PxrRemap",
"PxrRoundCube",
"PxrSeExpr",
"PxrShadedSide",
"PxrSwitch",
"PxrTangentField",
"PxrTee",
"PxrTexture",
"PxrThinFilm",
"PxrThreshold",
"PxrTileManifold",
"PxrToFloat",
"PxrToFloat3",
"PxrVariable",
"PxrVary",
"PxrVoronoise",
"PxrWireframe",
"PxrWorley",
"PxrSurface",
"PxrLayerSurface",
"PxrConstant",
"PxrLayer",
"PxrLayerMixer"];

	var components =[]

	for (i = 0; i < PxrXmlArgsList.length; i++){
		components.push(new PxrXmlArgsComponent(PxrXmlArgsList[i]))
	}

    var editor = new Rete.NodeEditor('demo@0.1.0', container);
    editor.use(ConnectionPlugin.default);
    editor.use(VueRenderPlugin);
	editor.use(ConnectionPathPlugin, { arrow: false });
    editor.use(ContextMenuPlugin, {
    searchBar: true, // true by default
    searchKeep: title => true, // leave item when searching, optional. For example, title => ['Refresh'].includes(title)
    delay: 500,
    allocate(component) {
        return ['Submenu'];
    },
    rename(component) {
        return component.name;
    },
    items: {
        'Click me'(){ console.log('Works!') }
    },
    nodeItems: {
        'Click me'(){ console.log('Works for node!') }
    }
});

    var engine = new Rete.Engine('demo@0.1.0');
    
    components.map(c => {
        editor.register(c);
        engine.register(c);
    });
	
	document.getElementById("download_link").onclick = async ()=> {
	editorJSON = editor.toJSON();
	var outputRib = ''
	var PatternString = ''

		for (i in editorJSON.nodes) {
			PatternString = editorJSON.nodes[i].data.PxrShaderType +" \"" + editorJSON.nodes[i].name + "\" \"" + editorJSON.nodes[i].name + editorJSON.nodes[i].id + "\"\n"
			
			//var keys = Object.keys(editorJSON.nodes[i].inputs);
			//for ( var j in Object.keys(editorJSON.nodes[i].inputs)) {
			//	console.log("\t\"" + keys[j] + "\" [" + editorJSON.nodes[i].data[keys[j]] + "]");
			//}
			var keys = Object.keys(editorJSON.nodes[i].data);
			var dataNodes = ''
			for ( var j in Object.keys(editorJSON.nodes[i].data)) {
				if (keys[j] == "PxrShaderType") {
					 continue; // "PxrShaderType" is not a input node but stores if the current PxrXmlArgs is "pattern", "bxdf", etc. Thats why its skipped.
				}	
				
				dataNodes = dataNodes + "\t\"" + keys[j] + "\" [" + editorJSON.nodes[i].data[keys[j]] + "]\n"
			}
			
			var mkeys = Object.keys(editorJSON.nodes[i].inputs);
			
			connString = ''
			for ( var j in Object.keys(editorJSON.nodes[i].inputs)) {
				var InputConnections = editorJSON.nodes[i].inputs[mkeys[j]].connections[0]
				var isVstruct =  mkeys[j].split(" ");
				var currentNodeName = isVstruct[1];
				isVstruct = isVstruct[0];
				var isVstructNotice = ''
				if (InputConnections) { //Current input node has input connections
					
					if (isVstruct == 'vstruct'){ // Current input node has input connections AND is a vstruct.
						isVstructNotice = "\n\t##Need vstruct handling !! reference " + mkeys[j] + "\" [\"" + editorJSON.nodes[InputConnections.node].name + InputConnections.node + ":" + InputConnections.output +"\"]\n"
						
						var potentialVstructOutput = PxrJSON[editorJSON.nodes[InputConnections.node].name].args.output 
						
						for(var k = 0; k < potentialVstructOutput.length; k++) {
							
							if (potentialVstructOutput[k]["@attributes"].vstructmember){ // potentialVstructOutput is really a vstructmember
								
								var currentOutputVstructMemberName = potentialVstructOutput[k]["@attributes"].vstructmember.split(".");
								currentOutputVstructMemberName = currentOutputVstructMemberName[0]
								
								if (currentOutputVstructMemberName == InputConnections.output){ //In the case we have more then one vstruct output nodes, we need to be sure to only go through those members to which we are currently connected.
									
									var evalVstructAction = evaluateVstructConditionalExpr(potentialVstructOutput[k]["@attributes"].vstructConditionalExpr, editorJSON.nodes[InputConnections.node]) // evaluate the vstructConditionalExpr formula of the actual instance of PxrXmlArgs which is "sending"
									console.log(JSON.stringify(potentialVstructOutput[k]))
									
									if (evalVstructAction["action"] == "connect") {
										
										var vstructmemberSecondPart = potentialVstructOutput[k]["@attributes"].vstructmember.split(".");
										vstructmemberSecondPart = vstructmemberSecondPart[1]
										
										//dirty loop to push the params below or under page item down to the "normal" params
										for (var m = 0; m < PxrJSON[editorJSON.nodes[i].name].args.page.length; m++) {
											for (var n = 0; n < PxrJSON[editorJSON.nodes[i].name].args.page[m].param.length; n++) {
												PxrJSON[editorJSON.nodes[i].name].args.param.push(PxrJSON[editorJSON.nodes[i].name].args.page[m].param[n])
											}
										}
										
										var filteredPxrJSON = PxrJSON[editorJSON.nodes[i].name].args.param.filter(x => x["@attributes"].vstructmember === currentNodeName + "." + vstructmemberSecondPart); //check if for the actual sending virtual connection there is an input existing.
										if (filteredPxrJSON.length > 0) {
											//console.log(filteredPxrJSON[0]["@attributes"].name)
											isVstructNotice = isVstructNotice + "\t\"reference " + filteredPxrJSON[0]["@attributes"].type + " " + filteredPxrJSON[0]["@attributes"].name + "\" [\"" + editorJSON.nodes[InputConnections.node].name + InputConnections.node + ":" + potentialVstructOutput[k]["@attributes"].name +"\"]\n"
										}
										
										else if (PxrJSON[editorJSON.nodes[i].name].args.page.filter(x => x["@attributes"].vstructmember === currentNodeName + "." + vstructmemberSecondPart).length > 0) { //PxrLayerSurface has a slightly different XML dialect and has a page tag for some!! param..... ouch
											
										}
									}
									
									else if (evalVstructAction["action"] == "set") {
									
										var vstructmemberSecondPart = potentialVstructOutput[k]["@attributes"].vstructmember.split(".");
										vstructmemberSecondPart = vstructmemberSecondPart[1]
										
										//dirty loop to push the params below or under page item down to the "normal" params
										for (var m = 0; m < PxrJSON[editorJSON.nodes[i].name].args.page.length; m++) {
											for (var n = 0; n < PxrJSON[editorJSON.nodes[i].name].args.page[m].param.length; n++) {
												PxrJSON[editorJSON.nodes[i].name].args.param.push(PxrJSON[editorJSON.nodes[i].name].args.page[m].param[n])
											}
										}
										
										var filteredPxrJSON = PxrJSON[editorJSON.nodes[i].name].args.param.filter(x => x["@attributes"].vstructmember === currentNodeName + "." + vstructmemberSecondPart); //check if for the actual sending virtual connection there is an input existing.
										if (filteredPxrJSON.length > 0) {
											//console.log(filteredPxrJSON[0]["@attributes"].name)
											isVstructNotice = isVstructNotice + "\t\"" + filteredPxrJSON[0]["@attributes"].type + " " + filteredPxrJSON[0]["@attributes"].name + "\" [" + evalVstructAction["value"] +"]\n"
										}
										
										else if (PxrJSON[editorJSON.nodes[i].name].args.page.filter(x => x["@attributes"].vstructmember === currentNodeName + "." + vstructmemberSecondPart).length > 0) { //PxrLayerSurface has a slightly different XML dialect and has a page tag for some!! param..... ouch
											
										}
										
									}
								}
							}
						}
						//console.log(PxrJSON[editorJSON.nodes[InputConnections.node].name]);
						connString = connString + isVstructNotice
						continue;
					}
					
					
				connString = connString  + "\t\"reference " + mkeys[j] + "\" [\"" + editorJSON.nodes[InputConnections.node].name + InputConnections.node + ":" + InputConnections.output +"\"]\n"
				}
			}
			
			outputRib = outputRib + PatternString + dataNodes + connString
			
		outputRib = outputRib + "\n"
		}
	outputRib = "#Slim Shady Material\n" + outputRib; // + JSON.stringify(editorJSON, null, "\t")
	var data = new Blob([outputRib], {type: 'text/plain'});
	var url = window.URL.createObjectURL(data);

	document.getElementById('download_link').href = url;
	};
	
	
	document.getElementById("save_link").onclick = async ()=> {
		const savedata = JSON.stringify(editor.toJSON());
		var data = new Blob([savedata], {type: 'text/plain'});
		var url = window.URL.createObjectURL(data);
		document.getElementById('save_link').href = url;
	};
	
	
	document.getElementById('file-input').onchange = async ()=> {
		var file = self.document.getElementById('file-input').files[0];
		if (!file) {return;}
		var reader = new FileReader();
		reader.onload = function(e) {
			var contents = e.target.result;
			console.log(contents); // Display file content

			//editor.fromJSON(contents);
		};
		reader.readAsText(file);
	};
	
	
	var PxrWireframe = await components[59].createNode({ 
	"color wireColor": "0 0 0",
	"color backColor": "1 1 1",
	"float wireOpacity": "1",
	"float wireWidth": "2"
	});
	
	var PxrWireLayer = await components[64].createNode({ 
	});
	
	var PxrExposure = await components[20].createNode({ 
	"float stops": "1"
	});
	
	var PxrColorCorrect = await components[12].createNode({ 
	"vector gamma": "0.1 0.1 0.1"
	});
	
	var PxrInvert = await components[28].createNode({ 
	});
	
	var PxrToFloat = await components[54].createNode({ 
	});
	
	var PxrLayer1 = await components[64].createNode({ 
	"int enableDiffuseAlways" : "1",
	"float diffuseGain": "1.0",
	"color diffuseColor": "0.94 0.2 0.25",
	"int diffuseDoubleSided": "1",
	"color specularFaceColor": "0.1 0.1 0.15",
	"color specularIor": "1.54 1.54 1.54",
	"float specularRoughness": "0.25",
	"int specularDoubleSided": "0",
	"float presence": "1"
	});
	
	var PxrLayerMixer = await components[65].createNode({ 
	"int enableDiffuseAlways": "1",
	"int layer1Enabled": "1"
	});
	
	var PxrLayerSurface = await components[62].createNode({ 
	});
	
	var PxrFractal = await components[23].createNode({ 
	"int surfacePosition": 0, 
	"int layers": "1", 
	"float frequency": "2.5",
	"float lacunarity": "16.0",
	"float dimension": "1.0",
	"float erosion": "0.0",
	"float variation": "1.0",
	"int turbulent": "0"
	});
	
	//var PxrNormalMap = await components[35].createNode({ "float bumpScale": "-0.2","normal bumpOverlay": "0 0 0","int invertBump": "0","int orientation": "2","int flipX": "0","int flipY": "0","int firstChannel": "0","int atlasStyle": "0","int invertT": "1","float blur": "0.0","int lerp": "1","int filter": "1","int reverse": "0","float adjustAmount": "0.0","float surfaceNormalMix": "0.0","int disable": [0]});
	
	//var PxrSurface = await components[61].createNode({ "float diffuseGain": "1.0","color diffuseColor": "0.94 0.2 0.25","int diffuseDoubleSided": "1","color specularFaceColor": "0.1 0.1 0.15","color specularIor": "1.54 1.54 1.54","float specularRoughness": "0.25","int specularDoubleSided": "0","float presence": "1"});
	
	//PxrCurvature.data["collapsed"] = true;
	
	PxrWireframe.position = [10, 40];
	PxrWireLayer.position = [80, 300];
	PxrExposure.position = [240, 30];
	PxrColorCorrect.position = [610, 45];
	PxrInvert.position = [950, 50];
	PxrToFloat.position = [1300, 200];
	PxrLayer1.position = [630, 700];
	PxrLayerMixer.position = [1540, 270];
	PxrLayerSurface.position = [1990, 70];
	
	editor.addNode(PxrWireframe);
	editor.addNode(PxrWireLayer);
	editor.addNode(PxrExposure);
	editor.addNode(PxrColorCorrect);
	editor.addNode(PxrInvert);
	editor.addNode(PxrToFloat);
	editor.addNode(PxrLayer1);
	editor.addNode(PxrLayerMixer);
	editor.addNode(PxrLayerSurface);
	
	
	editor.connect(PxrWireframe.outputs.get("Cout"), PxrExposure.inputs.get("color inputRGB"));
	editor.connect(PxrWireframe.outputs.get("Cout"), PxrWireLayer.inputs.get("color diffuseColor"));
	editor.connect(PxrExposure.outputs.get("resultRGB"), PxrColorCorrect.inputs.get("color inputRGB"));
	editor.connect(PxrColorCorrect.outputs.get("resultRGB"), PxrInvert.inputs.get("color inputRGB"));
	editor.connect(PxrInvert.outputs.get("resultRGB"), PxrToFloat.inputs.get("color input"));
	//editor.connect(PxrLayer1.outputs.get("pxrMaterialOut_diffuseGain"), PxrLayerMixer.inputs.get("float baselayer_diffuseGain"));
	//editor.connect(PxrLayer1.outputs.get("pxrMaterialOut_diffuseColor"), PxrLayerMixer.inputs.get("color baselayer_diffuseColor"));
	editor.connect(PxrLayer1.outputs.get("pxrMaterialOut"), PxrLayerMixer.inputs.get("vstruct baselayer"));
	//editor.connect(PxrWireLayer.outputs.get("pxrMaterialOut_diffuseColor"), PxrLayerMixer.inputs.get("color layer1_diffuseColor"));
	editor.connect(PxrWireLayer.outputs.get("pxrMaterialOut"), PxrLayerMixer.inputs.get("vstruct layer1"));
	editor.connect(PxrToFloat.outputs.get("resultF"), PxrLayerMixer.inputs.get("float layer1Mask"));
	
	//editor.connect(PxrLayerMixer.outputs.get("pxrMaterialOut_diffuseGain"), PxrLayerSurface.inputs.get("float diffuseGain"));
	//editor.connect(PxrLayerMixer.outputs.get("pxrMaterialOut_diffuseColor"), PxrLayerSurface.inputs.get("color diffuseColor"));
	//editor.connect(PxrLayerMixer.outputs.get("pxrMaterialOut_diffuseRoughness"), PxrLayerSurface.inputs.get("float diffuseRoughness"));
	//editor.connect(PxrLayerMixer.outputs.get("pxrMaterialOut_diffuseBackColor"), PxrLayerSurface.inputs.get("color diffuseBackColor"));
	//editor.connect(PxrLayerMixer.outputs.get("pxrMaterialOut_diffuseTransmitGain"), PxrLayerSurface.inputs.get("float diffuseTransmitGain"));
	//editor.connect(PxrLayerMixer.outputs.get("pxrMaterialOut_diffuseTransmitColor"), PxrLayerSurface.inputs.get("color diffuseTransmitColor"));
	//editor.connect(PxrLayerMixer.outputs.get("pxrMaterialOut_specularFaceColor"), PxrLayerSurface.inputs.get("color specularFaceColor"));
	//editor.connect(PxrLayerMixer.outputs.get("pxrMaterialOut_specularEdgeColor"), PxrLayerSurface.inputs.get("color specularEdgeColor"));
	//editor.connect(PxrLayerMixer.outputs.get("pxrMaterialOut_specularIor"), PxrLayerSurface.inputs.get("color specularIor"));
	//editor.connect(PxrLayerMixer.outputs.get("pxrMaterialOut_specularExtinctionCoeff"), PxrLayerSurface.inputs.get("color specularExtinctionCoeff"));
	//editor.connect(PxrLayerMixer.outputs.get("pxrMaterialOut_specularRoughness"), PxrLayerSurface.inputs.get("float specularRoughness"));
	//editor.connect(PxrLayerMixer.outputs.get("pxrMaterialOut_specularAnisotropy"), PxrLayerSurface.inputs.get("float specularAnisotropy"));
	editor.connect(PxrLayerMixer.outputs.get("pxrMaterialOut"), PxrLayerSurface.inputs.get("vstruct inputMaterial"));
	
	//editor.connect(PxrFractal.outputs.get("resultRGB"), PxrNormalMap.inputs.get("color inputRGB"));
	//editor.connect(PxrNormalMap.outputs.get("resultN"), PxrSurface.inputs.get("normal bumpNormal"));


	editor.on('process nodecreated noderemoved connectioncreated connectionremoved', async () => {
		console.log('process');
		await engine.abort();
		await engine.process(editor.toJSON());
	});

    editor.view.resize();
    editor.trigger('process');
})();


// converts XML to JSON
function xmlToJson(xml) {
	
	// Create the return object
	var obj = {};

	if (xml.nodeType == 1) { // element
		// do attributes
		if (xml.attributes.length > 0) {
		obj["@attributes"] = {};
			for (var j = 0; j < xml.attributes.length; j++) {
				var attribute = xml.attributes.item(j);
				obj["@attributes"][attribute.nodeName] = attribute.nodeValue.replace(/[\n\t\r]/g,"").trim();
			}
		}
	} else if (xml.nodeType == 3) { // text
		obj = xml.nodeValue.replace(/[\n\t\r]/g,"").trim();
	}

	// do children
	if (xml.hasChildNodes()) {
		for(var i = 0; i < xml.childNodes.length; i++) {
			var item = xml.childNodes.item(i);
			var nodeName = item.nodeName;
			if (typeof(obj[nodeName]) == "undefined") {
				obj[nodeName] = xmlToJson(item);
			} else {
				if (typeof(obj[nodeName].push) == "undefined") {
					var old = obj[nodeName];
					obj[nodeName] = [];
					obj[nodeName].push(old);
				}
				obj[nodeName].push(xmlToJson(item));
			}
		}
	}
	return obj;
};

function evaluateVstructConditionalExpr(vstructConditionalExprString, editorJSONnodes) {
	var paramvalue = {}
	var x;
	
	//Check if nodes are connected
	for (x in editorJSONnodes.inputs) {
		var key = x.split(" ");
		key = key[1]
		var val = editorJSONnodes.inputs[x].connections;
		if (val.length > 0 ) {
			//console.log("Key:"+ key + " Value:" + JSON.stringify(val))
			paramvalue[key] = "connected"
		}
		else {
			paramvalue[key] = "not_connected"
		}
	}
	
	//Get values of Nodes with data
	for (x in editorJSONnodes.data) {
		var key = x.split(" ");
		key = key[1]
		var val = editorJSONnodes.data[x];
		//console.log("Key:"+ key + " Value:" + val)
		paramvalue[key] = val
	}
	
	//paramvalue = {enableRR:"2", rrReflectionK:"connected", enableClearcoat:"1", singlescatterK:"connected", singlescatterDirectGain:"0.92", bumpNormal:"connected"};
	parser.yy = { parameval: function(t) {
		//console.log("Param: " + t + " Value: " + paramvalue[t])
		return paramvalue[t];
	}
	};
	
	output = parser.parse(vstructConditionalExprString)
	//console.log(JSON.stringify(editorJSONnodes.inputs))
	console.log("VStruct: " + vstructConditionalExprString + " Output: " + JSON.stringify(output));
	return output
}
