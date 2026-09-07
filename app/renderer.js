
    (() => {
      const root = document.getElementById('seaton-private');
      const $ = selector => root.querySelector(selector);
      const room = $('.sg-editor-room');
      const namesInput = $('#sg-names');
      const bridge = window.seaton;
      if(!bridge){document.body.textContent='자리온 실행 파일로 프로그램을 열어 주세요.';return;}
      const WIDTH = 1000, DESK_HEIGHT = 54, LIMIT = 60;
      const sampleNames = ['김민준','이서연','박도윤','최지우','정하준','강수아','조서준','윤하은','장예준','임지안','한시우','오채원','서주원','신다은','권지호','황유나','안도현','송소율','류건우','전예린','홍현우','고나윤','문준서','양서아','백태윤','남하린'];
      const parseNames = text => text.split(/[\r\n]+/).flatMap(line=>{
        const cells=line.split('\t').map(value=>value.trim()).filter(Boolean);
        if(cells.length===2&&/^\d+[.)]?$/.test(cells[0]))return [cells[1]];
        return line.split(/[\t,]+/).map(name=>name.trim().replace(/^\d+[.)]\s*/,''));
      }).filter(Boolean);
      const balanced = (total,count) => Array.from({length:count},(_,i) => Math.floor(total/count)+(i<total%count?1:0));
      const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
      const clone = value => JSON.parse(JSON.stringify(value));
      const extraPositionOptions = [['front','앞'],['back','뒤'],['left','왼쪽'],['right','오른쪽']];
      const normalizeExtraPositions = (counts,positions=[]) => counts.map((_,i)=>extraPositionOptions.some(([value])=>value===positions[i])?positions[i]:'right');
      let students = [];
      let seats = [], serial = 0, worldHeight = 680, deskWidth = 155;
      let layoutKind = 'groups', lineCounts = [7,7,6,6], groupCounts = [5,5,4,4,4,4];
      let groupExtraPositions = normalizeExtraPositions(groupCounts);
      let groupColumns = 3, appliedInnerGap = 8, appliedOuterGap = 70;
      let draftKind = 'groups', draftLines = [...lineCounts], draftGroups = [...groupCounts], draftColumns = 3;
      let draftExtraPositions = [...groupExtraPositions];
      let mode = 'group', teacherView = false, isPublic = true;
      let selectedId = null, pendingId = null, drag = null, suppressClick = false;
      let history = [];
      let preparedAssignments = null, preparedSignature = null, rosterRevision = 0;
      let pinExists = false, teacherUnlocked = false, assignmentDraft = null, draftSignature = null, privateNotice = '';
      let privateAccess = false, authPurpose = 'settings', brandTaps = [];
      let className='우리 반', appRole='control', ready=false, accessEpoch=0, commandEpoch=0, requestBusy=false;
      let saveTimer=null, saveChain=Promise.resolve(), lockChain=Promise.resolve(), lastSaved='', updateState=null, nativeDialogActive=false;
      let activeShow = null, showSerial = 0;
      const findSeat = id => seats.find(seat => seat.id === id);
      const findStudent = id => students.find(student => student.id === id);
      const newSeat = (x,y,groupId=null) => ({id:'s'+(++serial),x,y,temporary:false,studentId:null,groupId});
      const placedIds = () => new Set(seats.map(seat=>seat.studentId).filter(Boolean));
      const pendingStudents = () => {const placed=placedIds();return students.filter(student=>!placed.has(student.id));};
      const temporaryIds = () => new Set(seats.filter(seat=>seat.temporary&&seat.studentId).map(seat=>seat.studentId));
      const regularPopulation = () => students.length-temporaryIds().size;
      function snapshot(){return clone({students,seats,serial,worldHeight,deskWidth,layoutKind,lineCounts,groupCounts,groupExtraPositions,groupColumns,appliedInnerGap,appliedOuterGap,rosterRevision,className,settings:{rounds:Number($('#sr-rounds').value)||7,sound:$('#sr-sound').checked,gentle:$('#sr-gentle').checked,landscape:$('#app-landscape').checked}});}
      function loadState(value){
        const plan=clone(value);({students,seats,serial,worldHeight,deskWidth,layoutKind,lineCounts,groupCounts,groupColumns,appliedInnerGap,appliedOuterGap}=plan);
        groupExtraPositions=normalizeExtraPositions(groupCounts,plan.groupExtraPositions);
        rosterRevision=plan.rosterRevision||0;className=plan.className||'우리 반';
        const options=plan.settings||{};$('#sr-rounds').value=String(options.rounds||7);$('#sr-sound').checked=Boolean(options.sound);$('#sr-gentle').checked=Boolean(options.gentle);$('#app-landscape').checked=options.landscape!==false;
        $('#app-class-name').value=className;namesInput.value=students.map(student=>student.name).join('\n');
        draftLines=[...lineCounts];draftGroups=[...groupCounts];draftExtraPositions=[...groupExtraPositions];draftColumns=groupColumns;mode=layoutKind==='groups'?'group':'student';selectedId=null;pendingId=null;
        $('#sg-inner-gap').value=String(appliedInnerGap);$('#sg-outer-gap').value=String(appliedOuterGap);$('#sg-inner-value').textContent=String(appliedInnerGap);$('#sg-outer-value').textContent=String(appliedOuterGap);
        syncDraftControls();switchTab(layoutKind);updateImportCount();
      }
      function queueSave(){
        if(!ready||appRole!=='control'||activeShow)return;
        clearTimeout(saveTimer);saveTimer=setTimeout(()=>{saveTimer=null;flushSave().catch(()=>{});},180);
      }
      async function flushSave(){
        if(!ready||appRole!=='control')return;clearTimeout(saveTimer);saveTimer=null;
        const value=snapshot(),encoded=JSON.stringify(value);
        saveChain=saveChain.catch(()=>{}).then(async()=>{
          if(encoded===lastSaved)return;
          const result=await bridge.saveState(value);if(!result.ok)throw new Error(result.error||'자료를 저장하지 못했습니다.');
          lastSaved=encoded;$('.app-save-status').textContent='자동 저장됨 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
        }).catch(error=>{$('.app-save-status').textContent='저장 실패 · '+error.message;throw error;});
        return saveChain;
      }
      function setRequestBusy(value){requestBusy=value;$('.sg-work').inert=value;$('.sg-shuffle').disabled=value;$('.sr-reveal').disabled=value;}
      function pushSnapshot(value=snapshot()){history.push(value);if(history.length>20)history.shift();}
      function setStatus(text){$('.sg-status').textContent=text;}
      function studentLabel(student){
        const same=students.filter(item=>item.name===student.name);
        return student.name+(same.length>1?' · 동명 '+(same.findIndex(item=>item.id===student.id)+1):'');
      }
      function lineGeometry(counts){
        const width=Math.min(165,900/counts.length*.80), height=Math.max(560,210+Math.max(...counts)*68);
        const points=[];
        counts.forEach((count,column)=>{for(let row=0;row<count;row++)points.push({x:50+(column+.5)*900/counts.length,y:195+row*68,groupId:null});});
        return {points,width,height};
      }
      function groupShape(count,gap,extraPosition='right'){
        const points=[],paired=Math.floor(count/2), px=105+gap,py=DESK_HEIGHT+gap*.65;
        if(count===1)return {points:[{x:0,y:0}],width:105,height:DESK_HEIGHT};
        for(let row=0;row<paired;row++){points.push({x:0,y:row*py},{x:px,y:row*py});}
        if(count%2){
          if(extraPosition==='front'){points.forEach(point=>{point.y+=py;});points.push({x:px/2,y:0});}
          else if(extraPosition==='back')points.push({x:px/2,y:paired*py});
          else if(extraPosition==='left'){points.forEach(point=>{point.x+=px;});points.push({x:0,y:(paired-1)*py/2});}
          else points.push({x:px*2,y:(paired-1)*py/2});
        }
        return {points,width:Math.max(...points.map(point=>point.x))+105,height:Math.max(...points.map(point=>point.y))+DESK_HEIGHT};
      }
      function groupGeometry(counts,inner,outer,requestedColumns=3,extraPositions=[]){
        const shapes=counts.map((count,index)=>groupShape(count,inner,extraPositions[index])), columns=Math.min(Math.max(1,requestedColumns),counts.length);
        const columnWidths=Array.from({length:columns},(_,column)=>Math.max(...shapes.filter((_,index)=>index%columns===column).map(shape=>shape.width)));
        const allWidth=columnWidths.reduce((sum,width)=>sum+width,0)+(columns-1)*outer;
        const scaleX=Math.min(1,900/allWidth), left=(WIDTH-allWidth*scaleX)/2, points=[];
        let top=194;
        for(let start=0;start<counts.length;start+=columns){
          const row=shapes.slice(start,start+columns),rowHeight=Math.max(...row.map(shape=>shape.height));
          row.forEach((shape,column)=>{
            const x=columnWidths.slice(0,column).reduce((sum,width)=>sum+width,0)+column*outer+(columnWidths[column]-shape.width)/2+52.5;
            shape.points.forEach(point=>points.push({x:left+(x+point.x)*scaleX,y:top+point.y,groupId:'g'+(start+column+1)}));
          });
          top+=rowHeight+36+outer*.65;
        }
        return {points,width:105*scaleX,height:Math.max(560,top+5)};
      }
      function orderedRegularStudents(){
        const fixed=temporaryIds(),ordered=seats.filter(seat=>!seat.temporary&&seat.studentId).map(seat=>seat.studentId);
        const included=new Set(ordered);
        students.forEach(student=>{if(!fixed.has(student.id)&&!included.has(student.id)){ordered.push(student.id);included.add(student.id);}});
        return ordered;
      }
      function installGeometry(geometry,preserveGroups=false){
        const ordered=orderedRegularStudents(),temporary=seats.filter(seat=>seat.temporary);
        const groupQueues=new Map();
        if(preserveGroups){
          seats.filter(seat=>!seat.temporary).forEach(seat=>{
            if(!groupQueues.has(seat.groupId))groupQueues.set(seat.groupId,[]);
            groupQueues.get(seat.groupId).push(seat);
          });
        }
        seats=geometry.points.map((point,i)=>{
          const previous=preserveGroups?groupQueues.get(point.groupId)?.shift():null;
          return previous?{...previous,x:point.x,y:point.y}:{...newSeat(point.x,point.y,point.groupId),studentId:ordered[i]||null};
        }).concat(temporary);
        worldHeight=Math.max(geometry.height,...temporary.map(seat=>seat.y+DESK_HEIGHT/2+12));deskWidth=geometry.width;selectedId=null;pendingId=null;
      }
      function validateCounts(counts,kind){
        if(!counts.length||counts.some(value=>!Number.isInteger(value)||value<(kind==='groups'?1:0)||value>(kind==='groups'?8:LIMIT)))return kind==='groups'?'각 모둠 인원을 1~8명으로 입력하세요.':'각 줄 인원을 0~60명의 정수로 입력하세요.';
        const total=counts.reduce((sum,value)=>sum+value,0),needed=regularPopulation();
        if(total>LIMIT)return '일반 책상은 최대 60개입니다.';
        if(total<needed)return '총 '+total+'자리로는 '+needed+'명을 배치할 수 없습니다. '+(needed-total)+'자리를 더 지정하세요.';
        return '';
      }
      function updateSummary(){
        const counts=draftKind==='lines'?draftLines:draftGroups;
        const valid=counts.every(Number.isInteger),total=valid?counts.reduce((sum,value)=>sum+value,0):null;
        const temporary=temporaryIds().size;
        draftColumns=Math.min(draftColumns,draftGroups.length);
        Array.from($('#sg-group-columns').options).forEach(option=>{option.disabled=Number(option.value)>draftGroups.length;});
        $('#sg-group-columns').value=String(draftColumns);
        const columns=Math.min(draftColumns,draftGroups.length),rows=Math.ceil(draftGroups.length/columns),last=draftGroups.length%columns;
        $('.sg-arrangement').textContent='가로 '+columns+'모둠 × 세로 '+rows+'단'+(last?' · 마지막 단 '+last+'모둠':'');
        $('.sg-sum').textContent=(total===null?'인원을 입력하세요':'총 '+total+'자리 / 배치할 학생 '+regularPopulation()+'명')+(temporary?' · 임시석 '+temporary+'명 유지':'');
        $('.sg-apply').textContent=draftKind==='lines'?'줄 배치 적용':'모둠 배치 적용';
        $('.sg-layout-error').textContent='';
      }
      function renderCountInputs(kind){
        const group=kind==='groups',counts=group?draftGroups:draftLines,target=$(group?'.sg-group-counts':'.sg-line-counts');
        if(group)draftExtraPositions=normalizeExtraPositions(draftGroups,draftExtraPositions);
        target.replaceChildren();
        counts.forEach((value,index)=>{
          const label=document.createElement('label');label.textContent=(index+1)+(group?'모둠':'줄');
          const input=document.createElement('input');input.type='number';input.min=group?'1':'0';input.max=group?'8':'60';input.step='1';input.value=String(value);input.setAttribute('aria-label',(index+1)+(group?'모둠 인원':'줄 인원'));
          let positionSelect=null;
          input.addEventListener('input',()=>{counts[index]=input.value===''?NaN:Number(input.value);if(positionSelect)positionSelect.disabled=!(Number.isInteger(counts[index])&&counts[index]>1&&counts[index]%2===1);updateSummary();});
          label.appendChild(input);
          if(group){
            const choice=document.createElement('div');choice.className='sg-group-choice';label.className='sg-group-size';choice.appendChild(label);
            const positionLabel=document.createElement('label');positionLabel.className='sg-group-position';positionLabel.textContent='추가석';
            positionSelect=document.createElement('select');positionSelect.setAttribute('aria-label',(index+1)+'모둠 추가석 위치');
            extraPositionOptions.forEach(([position,text])=>{const option=document.createElement('option');option.value=position;option.textContent=text;positionSelect.appendChild(option);});
            positionSelect.value=draftExtraPositions[index];positionSelect.disabled=!(Number.isInteger(value)&&value>1&&value%2===1);
            positionSelect.addEventListener('change',()=>{draftExtraPositions[index]=positionSelect.value;updateSummary();});
            positionLabel.appendChild(positionSelect);choice.appendChild(positionLabel);target.appendChild(choice);
          }else target.appendChild(label);
        });
      }
      function syncDraftControls(){
        $('#sg-line-count').value=String(draftLines.length);$('#sg-group-count').value=String(draftGroups.length);
        $('#sg-group-columns').value=String(draftColumns);
        renderCountInputs('lines');renderCountInputs('groups');updateSummary();
      }
      function switchTab(kind){
        draftKind=kind;
        root.querySelectorAll('.sg-tabs button').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.kind===kind)));
        $('#sg-line-panel').hidden=kind!=='lines';$('#sg-group-panel').hidden=kind!=='groups';updateSummary();
      }
      function updateImportCount(){
        const names=parseNames(namesInput.value),duplicates=names.length-new Set(names).size;
        $('.sg-import-count').textContent=names.length+'명 인식'+(duplicates?' · 같은 이름도 각각 유지':'');$('.sg-import-error').textContent='';
      }
      function displayPoint(point,teacher,height=worldHeight){return teacher?{x:WIDTH-point.x,y:height-point.y}:point;}
      function positionElement(element,point,teacher,height=worldHeight){const shown=displayPoint(point,teacher,height);element.style.left=shown.x/WIDTH*100+'%';element.style.top=shown.y+'px';}
      function shouldShow(seat,editing){return editing||!seat.temporary||Boolean(seat.studentId);}
      function renderRoom(target,teacher,editing,viewModel=null){
        const viewSeats=viewModel?viewModel.seats:seats,viewHeight=viewModel?viewModel.worldHeight:worldHeight,viewWidth=viewModel?viewModel.deskWidth:deskWidth;
        target.replaceChildren();target.style.height=viewHeight+'px';
        [{x:500,y:31,label:'칠판',className:'sg-board'},{x:500,y:101,label:'교탁',className:'sg-podium'}].forEach(item=>{
          const element=document.createElement('div');element.className='sg-item '+item.className;element.textContent=item.label;positionElement(element,item,teacher,viewHeight);target.appendChild(element);
        });
        const groups=[...new Set(viewSeats.map(seat=>seat.groupId).filter(Boolean))];
        groups.forEach(groupId=>{
          const members=viewSeats.filter(seat=>seat.groupId===groupId),xs=members.map(seat=>seat.x),ys=members.map(seat=>seat.y);
          const item={x:(Math.min(...xs)+Math.max(...xs))/2,y:Math.min(...ys)-43};
          const label=document.createElement('div');label.className='sg-item sg-group-label';label.dataset.groupLabel=groupId;label.textContent=groupId.slice(1)+'모둠';positionElement(label,item,teacher,viewHeight);target.appendChild(label);
        });
        viewSeats.filter(seat=>shouldShow(seat,editing)).forEach(seat=>{
          const student=findStudent(seat.studentId),element=document.createElement(editing?'button':'div');
          const selected=editing&&(selectedId===seat.id||(mode==='group'&&seat.groupId&&findSeat(selectedId)?.groupId===seat.groupId));
          if(editing){element.type='button';element.setAttribute('aria-pressed',String(selected));}
          element.dataset.seatId=seat.id;
          element.className='sg-item sg-seat'+(!student?' sg-empty':'')+(!student&&seat.temporary?' sg-temp-empty':'')+(selected?' sg-selected':'');
          element.style.width=(seat.temporary?130:viewWidth)/WIDTH*100+'%';element.style.height=DESK_HEIGHT+'px';
          const name=document.createElement('span');name.className='sg-seat-name';name.textContent=student?student.name:seat.temporary?'+':'—';
          if(student){const same=students.filter(item=>item.name===student.name);if(same.length>1){const duplicate=document.createElement('span');duplicate.className='sg-duplicate';duplicate.textContent='동명 '+(same.findIndex(item=>item.id===student.id)+1);name.appendChild(duplicate);}}
          element.appendChild(name);element.setAttribute('aria-label',student?studentLabel(student)+(editing&&seat.temporary?' 임시 자리':' 자리'):seat.temporary?'학생을 배치할 임시 자리':'학생이 없는 일반 자리');
          positionElement(element,seat,teacher,viewHeight);target.appendChild(element);
        });
      }
      function renderPending(){
        const pending=pendingStudents();$('.sg-pending').hidden=isPublic||pending.length===0;
        $('.sg-pending-heading').textContent='미배치 '+pending.length+'명 · 이름 선택 후 빈 책상 클릭';
        const target=$('.sg-pending-list');target.replaceChildren();
        pending.forEach(student=>{const button=document.createElement('button');button.type='button';button.textContent=studentLabel(student);button.setAttribute('aria-pressed',String(pendingId===student.id));button.addEventListener('click',()=>{pendingId=student.id;selectedId=null;mode='student';render();setStatus(studentLabel(student)+' 선택 · 배치할 빈 책상을 클릭하세요.');});target.appendChild(button);});
      }
      function render(){
        renderRoom(room,teacherView,!isPublic);root.classList.toggle('sg-public',isPublic);
        room.setAttribute('aria-label',isPublic?'자리 배치':'자리 배치. 교탁 양옆 더하기 표시는 임시 자리입니다.');
        $('.sg-sidebar').hidden=isPublic;$('.sg-editor-tools').hidden=isPublic;$('.sg-shuffle').hidden=false;$('.sg-print-open').hidden=isPublic;$('.sg-status').hidden=isPublic;
        const pending=pendingStudents().length,regular=seats.filter(seat=>!seat.temporary).length;
        $('.sg-population').textContent=isPublic?students.length+'명':students.length+'명 · 배치 '+(students.length-pending)+'명 · 미배치 '+pending+'명 · 일반 책상 '+regular+'개';
        $('.app-class-heading').textContent=className;$('.sr-class').textContent=className;
        if(appRole==='display'){$('.sg-header').hidden=true;$('.app-reveal-actions').hidden=true;}
        $('.sg-public-toggle').textContent='학생 공개 화면';$('.sg-public-toggle').hidden=isPublic;$('.sg-public-toggle').setAttribute('aria-pressed',String(isPublic));
        ['student','desk','group'].forEach(value=>$('.sg-mode-'+value).setAttribute('aria-pressed',String(mode===value)));
        $('.sg-mode-group').disabled=!seats.some(seat=>seat.groupId);
        $('.sg-mode-hint').textContent=mode==='student'?'이름을 끌거나 두 자리를 클릭':mode==='desk'?'책상째 자유롭게 드래그 · 방향키로 미세 조정':'모둠의 책상을 끌면 모둠 전체 이동 · 방향키 지원';
        $('.sg-view-student').setAttribute('aria-pressed',String(!teacherView));$('.sg-view-teacher').setAttribute('aria-pressed',String(teacherView));
        $('.sg-delete').disabled=!selectedId;$('.sg-undo').disabled=history.length===0;
        $('.sg-clear-empty').disabled=!seats.some(seat=>!seat.temporary&&!seat.studentId);
        renderPending();updateSummary();updatePreparedStatus();queueSave();
        if(ready&&appRole==='control'&&!activeShow)bridge.publishDisplay(snapshot()).catch(()=>{});
      }
      function finishChange(message){selectedId=null;pendingId=null;render();setStatus(message);}
      function transfer(fromId,toId){
        const from=findSeat(fromId),to=findSeat(toId);if(!from||!to||from.id===to.id||!from.studentId)return;
        const fromName=studentLabel(findStudent(from.studentId)),other=to.studentId?studentLabel(findStudent(to.studentId)):null;
        pushSnapshot();[from.studentId,to.studentId]=[to.studentId,from.studentId];finishChange(other?fromName+' ↔ '+other+' 자리 교환':fromName+' 자리 이동');
      }
      function focusSeat(id){const element=room.querySelector('[data-seat-id="'+id+'"]');if(element)element.focus({preventScroll:true});}
      function movingSeats(id){const seat=findSeat(id);if(!seat)return [];return mode==='group'&&seat.groupId?seats.filter(item=>item.groupId===seat.groupId):[seat];}
      function moveCollection(originals,dx,dy){
        const minX=Math.min(...originals.map(item=>item.x-(item.temporary?130:deskWidth)/2)),maxX=Math.max(...originals.map(item=>item.x+(item.temporary?130:deskWidth)/2));
        const minY=Math.min(...originals.map(item=>item.y-DESK_HEIGHT/2)),maxY=Math.max(...originals.map(item=>item.y+DESK_HEIGHT/2));
        const actualX=clamp(dx,5-minX,WIDTH-5-maxX),actualY=clamp(dy,65-minY,worldHeight-8-maxY);
        originals.forEach(original=>{const seat=findSeat(original.id);seat.x=original.x+actualX;seat.y=original.y+actualY;});
      }
      function hitSeat(x,y,excludeId){
        let best=null,distance=Infinity;
        room.querySelectorAll('.sg-seat').forEach(element=>{if(element.dataset.seatId===excludeId)return;const rect=element.getBoundingClientRect();if(x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom){const d=Math.hypot(x-(rect.left+rect.width/2),y-(rect.top+rect.height/2));if(d<distance){best=element.dataset.seatId;distance=d;}}});return best;
      }
      function planSignature(plan=snapshot()){
        return JSON.stringify({revision:rosterRevision,students:plan.students.map(s=>[s.id,s.name]).sort((a,b)=>a[0].localeCompare(b[0])),seats:plan.seats.map(s=>[s.id,Boolean(s.temporary),s.groupId||null,s.temporary?Boolean(s.studentId):null]).sort((a,b)=>a[0].localeCompare(b[0]))});
      }
      function completePlanError(plan){
        const expected=new Set(plan.students.map(s=>s.id)),placed=plan.seats.map(s=>s.studentId).filter(Boolean);
        if(placed.length!==expected.size||new Set(placed).size!==placed.length||placed.some(id=>!expected.has(id)))return '모든 학생을 한 자리씩 배치한 뒤 실행해 주세요.';
        if(plan.seats.some(s=>!Number.isFinite(s.x)||!Number.isFinite(s.y)))return '책상 위치를 확인해 주세요.';
        return '';
      }
      function preparedError(){
        if(!preparedAssignments)return '준비 배정이 없습니다. 자리별 학생 지정을 먼저 저장해 주세요.';
        if(preparedSignature!==planSignature())return '명단이나 책상 구성이 달라졌습니다. 자리별 학생 지정을 다시 저장해 주세요.';
        return completePlanError(withAssignments(snapshot(),preparedAssignments));
      }
      function updatePreparedStatus(){
        if(!teacherUnlocked||!privateAccess||$('.sp-private').hidden){$('.sr-preset-status').textContent='';$('.sr-teacher-error').textContent='';$('.sr-clear').disabled=true;return;}
        const error=preparedAssignments?preparedError():'';
        $('.sr-preset-status').textContent=!preparedAssignments?'준비 배정 없음':error?'준비 배정 확인 필요':'준비 배정 저장됨 · '+students.length+'명';
        $('.sr-clear').disabled=!preparedAssignments;$('.sr-teacher-error').textContent=privateNotice;
      }
      function reportTeacherError(message,privateMessage=false){
        privateNotice=message;
        if(privateAccess&&!$('.sp-private').hidden){$('.sp-draft-error').textContent=message;updatePreparedStatus();}
        else{$('.sg-status').hidden=false;setStatus(isPublic||privateMessage?'발표 준비를 확인해 주세요.':message);}
      }
      function assignmentsFrom(plan){return Object.fromEntries(plan.seats.map(seat=>[seat.id,seat.studentId||null]));}
      function withAssignments(plan,assignments){
        const value=clone(plan);value.seats.forEach(seat=>{seat.studentId=assignments[seat.id]||null;});return value;
      }
      function applyAssignments(plan){
        const assignments=assignmentsFrom(plan);seats.forEach(seat=>{seat.studentId=assignments[seat.id]||null;});
      }
      function clearPrivateDraft(){
        privateAccess=false;brandTaps=[];assignmentDraft=null;draftSignature=null;$('.sp-private').hidden=true;$('.sp-private-room').replaceChildren();$('.sp-assignments').replaceChildren();$('.sp-draft-status').textContent='';$('.sp-draft-error').textContent='';updatePreparedStatus();
      }
      function lockPublic(){
        const pendingSave=flushSave();
        accessEpoch+=1;preparedAssignments=null;preparedSignature=null;privateNotice='';
        teacherUnlocked=false;isPublic=true;selectedId=null;pendingId=null;authPurpose='settings';brandTaps=[];
        if(drag){drag=null;suppressClick=false;}
        clearPrivateDraft();$('.sp-auth').hidden=true;$('#sp-pin').value='';$('#sp-pin-confirm').value='';$('.sp-auth-error').textContent='';
        $('.sg-print').hidden=true;$('.sg-print-pages').replaceChildren();$('.sg-header').hidden=false;$('.sg-work').hidden=false;
        render();
        if(appRole==='control')lockChain=pendingSave.catch(()=>{}).then(()=>bridge.lock()).catch(()=>{});
      }
      function handleBrandTap(now=Date.now()){
        if(activeShow||appRole!=='control'||requestBusy||!$('.sp-auth').hidden){brandTaps=[];return;}
        brandTaps=brandTaps.filter(time=>now-time<=4000);
        if(brandTaps.length&&now-brandTaps[brandTaps.length-1]>1500)brandTaps=[];
        brandTaps.push(now);
        if(brandTaps.length===5){brandTaps=[];openSettings('private');}
      }
      function openSettings(purpose='settings'){
        if(activeShow||appRole!=='control'||requestBusy)return;
        brandTaps=[];
        if(purpose!=='private'&&teacherUnlocked){accessEpoch+=1;authPurpose='settings';$('.sp-auth').hidden=true;$('#sp-pin').value='';$('#sp-pin-confirm').value='';$('.sg-print').hidden=true;clearPrivateDraft();$('.sg-header').hidden=false;$('.sg-work').hidden=false;return;}
        accessEpoch+=1;authPurpose=purpose==='private'?'private':'settings';clearPrivateDraft();
        $('.sg-header').hidden=true;$('.sg-work').hidden=true;$('.sg-print').hidden=true;$('.sp-auth').hidden=false;
        $('.sp-pin-confirm-label').hidden=pinExists;$('#sp-pin-confirm').required=!pinExists;
        $('.sp-auth-hint').textContent=pinExists?'설정을 열 PIN을 입력해 주세요.':'처음 사용할 PIN을 정하세요. 숫자 6~12자리';
        $('#sp-pin').value='';$('#sp-pin-confirm').value='';$('.sp-auth-error').textContent='';$('#sp-pin').focus();
      }
      async function unlockSettings(pin,confirm){
        if(!/^\d{6,12}$/.test(pin)){return '숫자 6~12자리 PIN을 입력해 주세요.';}
        if(!pinExists&&pin!==confirm)return '두 PIN이 일치하지 않습니다.';
        const epoch=accessEpoch,purpose=authPurpose;await lockChain;const result=await bridge.unlock({pin,confirm});
        if(epoch!==accessEpoch){bridge.lock().catch(()=>{});return '';}
        if(!result.ok)return result.error||'설정을 열지 못했습니다.';
        pinExists=true;preparedAssignments=result.prepared?.assignments||null;preparedSignature=result.prepared?.signature||null;
        teacherUnlocked=true;isPublic=false;$('.sp-auth').hidden=true;$('#sp-pin').value='';$('#sp-pin-confirm').value='';
        authPurpose='settings';privateAccess=purpose==='private';
        $('.sg-header').hidden=false;$('.sg-work').hidden=false;render();if(privateAccess)openAssignmentEditor();bridge.getUpdateState().then(showUpdateState).catch(()=>{});return '';
      }
      function renderAssignmentDraft(){
        if(!teacherUnlocked||!privateAccess||!assignmentDraft)return;
        const view=withAssignments(snapshot(),assignmentDraft),target=$('.sp-assignments');target.replaceChildren();
        renderRoom($('.sp-private-room'),false,true,view);
        const cards=$('.sp-private-room').querySelectorAll('[data-seat-id]');
        seats.forEach((seat,index)=>{
          const shortLabel=seat.temporary?'임시 '+(seats.filter(s=>s.temporary).findIndex(s=>s.id===seat.id)+1):'자리 '+(index+1);
          const card=Array.from(cards).find(item=>item.dataset.seatId===seat.id);
          if(card){const badge=document.createElement('span');badge.className='sp-seat-index';badge.textContent=shortLabel;const name=card.querySelector('.sg-seat-name'),duplicate=name.querySelector('.sg-duplicate');if(duplicate)badge.appendChild(duplicate);name.prepend(badge);card.setAttribute('aria-label',shortLabel+' 학생 선택');card.addEventListener('click',()=>$('#sp-seat-'+index).focus({preventScroll:false}));}
          const row=document.createElement('label');row.className='sp-assignment-row';row.htmlFor='sp-seat-'+index;const label=document.createElement('span');label.textContent=shortLabel;row.appendChild(label);
          const select=document.createElement('select');select.id='sp-seat-'+index;select.setAttribute('aria-label',shortLabel+' 학생');
          const empty=document.createElement('option');empty.value='';empty.textContent='배정 안 함';select.appendChild(empty);
          if(seat.temporary){select.disabled=!seat.studentId;empty.disabled=Boolean(seat.studentId);if(!seat.studentId)empty.textContent='미사용';}
          students.forEach(student=>{const option=document.createElement('option');option.value=student.id;option.textContent=studentLabel(student);select.appendChild(option);});
          select.value=assignmentDraft[seat.id]||'';select.addEventListener('change',()=>{changeDraftAssignment(seat.id,select.value||null);$('#sp-seat-'+index).focus({preventScroll:true});});row.appendChild(select);target.appendChild(row);
        });
        const assigned=new Set(Object.values(assignmentDraft).filter(Boolean));$('.sp-draft-status').textContent='배정 '+assigned.size+' / '+students.length+'명 · 공개 자리표와 책상 위치는 그대로 유지됩니다.';
      }
      function openAssignmentEditor(){
        if(!teacherUnlocked||!privateAccess||activeShow)return;
        assignmentDraft=preparedAssignments&&!preparedError()?clone(preparedAssignments):assignmentsFrom(snapshot());draftSignature=planSignature();
        $('.sg-header').hidden=true;$('.sg-work').hidden=true;$('.sp-private').hidden=false;$('.sp-draft-error').textContent='';renderAssignmentDraft();updatePreparedStatus();
      }
      function changeDraftAssignment(seatId,studentId){
        if(!teacherUnlocked||!privateAccess||!assignmentDraft||!findSeat(seatId)||(studentId&&!findStudent(studentId)))return;
        const old=assignmentDraft[seatId]||null,other=studentId?Object.keys(assignmentDraft).find(id=>id!==seatId&&assignmentDraft[id]===studentId):null;
        const proposed=clone(assignmentDraft);if(other)proposed[other]=old;proposed[seatId]=studentId;
        if(seats.some(seat=>seat.temporary&&Boolean(seat.studentId)!==Boolean(proposed[seat.id]))){$('.sp-draft-error').textContent='임시 자리의 사용 여부는 편집 화면에서 먼저 정해 주세요.';renderAssignmentDraft();return;}
        assignmentDraft=proposed;$('.sp-draft-error').textContent='';renderAssignmentDraft();
      }
      async function saveAssignmentDraft(){
        if(!teacherUnlocked||!privateAccess||!assignmentDraft)return;
        const error=draftSignature!==planSignature()?'명단이나 책상이 변경되었습니다. 편집 화면에서 다시 열어 주세요.':completePlanError(withAssignments(snapshot(),assignmentDraft));
        if(error){$('.sp-draft-error').textContent=error;return;}
        const assignments=clone(assignmentDraft),signature=planSignature(),epoch=accessEpoch;
        await flushSave();const result=await bridge.savePrepared({assignments,signature});
        if(epoch!==accessEpoch)return;
        if(!result.ok){$('.sp-draft-error').textContent=result.error||'준비 배정을 저장하지 못했습니다.';return;}
        preparedAssignments=assignments;preparedSignature=signature;privateNotice='';
        clearPrivateDraft();$('.sg-header').hidden=false;$('.sg-work').hidden=false;render();setStatus('저장했습니다.');
      }
      function randomPlan(source){
        const target=clone(source),fixed=new Set(target.seats.filter(s=>s.temporary&&s.studentId).map(s=>s.studentId));
        const regular=target.seats.filter(s=>!s.temporary),ids=target.students.filter(s=>!fixed.has(s.id)).map(s=>s.id);
        if(regular.length<ids.length)throw new Error('일반 책상이 '+(ids.length-regular.length)+'개 부족합니다. 책상을 추가해 주세요.');
        while(ids.length<regular.length)ids.push(null);
        for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
        regular.forEach((seat,i)=>{seat.studentId=ids[i];});return target;
      }
      async function chooseResult(usePrepared){
        if(usePrepared){const result=await bridge.choosePrepared(snapshot());if(!result.ok)throw new Error(result.error||'발표 준비를 확인해 주세요.');return result.target;}
        const target=randomPlan(snapshot()),error=completePlanError(target);if(error)throw new Error(error);return target;
      }
      function showWait(run,ms){return new Promise(resolve=>{
        if(activeShow!==run||run.finished){resolve(false);return;}
        const timer=setTimeout(()=>{run.waits.delete(timer);resolve(activeShow===run&&!run.finished);},ms);run.waits.set(timer,resolve);
      });}
      function stopRunWork(run){
        if(run.audioCloseTimer){clearTimeout(run.audioCloseTimer);run.audioCloseTimer=null;}
        run.waits.forEach((resolve,timer)=>{clearTimeout(timer);resolve(false);});run.waits.clear();
        run.animations.forEach(animation=>{try{animation.cancel();}catch{}});run.animations=[];
        if(run.audio){try{const result=run.audio.close();if(result&&result.catch)result.catch(()=>{});}catch{}run.audio=null;}
      }
      function startAudio(run){
        if(!$('#sr-sound').checked)return;const AudioClass=window.AudioContext||window.webkitAudioContext;if(!AudioClass)return;
        try{run.audio=new AudioClass();if(run.audio.resume)run.audio.resume().catch(()=>{});}catch{run.audio=null;}
      }
      function tone(run,frequency,duration=.14,offset=0){
        const context=run.audio;if(!context||context.state==='closed')return;
        try{const oscillator=context.createOscillator(),gain=context.createGain(),now=context.currentTime+offset;
          oscillator.type='triangle';oscillator.frequency.setValueAtTime(frequency,now);gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.045,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
          oscillator.connect(gain);gain.connect(context.destination);oscillator.start(now);oscillator.stop(now+duration+.03);
          oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
        }catch{}
      }
      function animateStageCards(run,final=false){
        if(run.reduced)return;const cards=$('.sr-stage-room').querySelectorAll('.sg-seat-name');
        cards.forEach((card,index)=>{
          if(typeof card.animate!=='function')return;
          const frames=final?[{transform:'translateY(12px) scale(.82)',opacity:.15},{transform:'translateY(0) scale(1.05)',opacity:1,offset:.72},{transform:'translateY(0) scale(1)',opacity:1}]:[{transform:'translateY(10px)',filter:'blur(2px)',opacity:.25},{transform:'translateY(-7px)',filter:'blur(1px)',opacity:.75,offset:.48},{transform:'translateY(0)',filter:'blur(0)',opacity:1}];
          const animation=card.animate(frames,{duration:final?700:400,delay:final?Math.min(index*22,650):index%4*12,easing:'cubic-bezier(.16,1,.3,1)',fill:'both'});run.animations.push(animation);
        });
      }
      function stagePattern(run,plan){
        run.animations.forEach(animation=>{try{animation.cancel();}catch{}});run.animations=[];
        renderRoom($('.sr-stage-room'),run.view,false,plan);
        run.displayPlan=clone(plan);publishStage(run);
      }
      function publishStage(run,maskNames=false){
        if(appRole!=='control'||!run.displayPlan)return;
        const frame=clone(run.displayPlan);frame.presentation={active:true,phase:$('.sr-phase').textContent,count:$('.sr-count').textContent,round:$('.sr-round').textContent,progress:parseFloat($('.sr-meter-fill').style.width)||0,maskNames,final:run.finished,view:run.view?'teacher':'student'};
        bridge.publishDisplay(frame).catch(()=>{});
      }
      function receiveDisplay(frame){
        if(frame?.state)frame=frame.state;if(!frame)return;loadState(frame);
        const show=frame.presentation;
        if(!show?.active){$('.sr-stage').hidden=true;$('.sg-work').hidden=false;render();return;}
        $('.sg-header').hidden=true;$('.sg-work').hidden=true;$('.sr-stage').hidden=false;$('.sr-stage-actions').hidden=true;
        $('.sr-class').textContent=className;$('.sr-phase').textContent=show.phase;$('.sr-count').textContent=show.count;$('.sr-round').textContent=show.round;$('.sr-meter-fill').style.width=show.progress+'%';$('.sr-stage').classList.toggle('sr-final',show.final);
        renderRoom($('.sr-stage-room'),show.view==='teacher',false,frame);
        if(show.maskNames)$('.sr-stage-room').querySelectorAll('.sg-seat').forEach(card=>{card.textContent='?';card.setAttribute('aria-label','공개 전 자리');});
      }
      function makeParticles(run){
        const box=$('.sr-particles');box.replaceChildren();if(run.reduced)return;
        for(let i=0;i<28;i++){const particle=document.createElement('span');particle.className='sr-particle';particle.style.setProperty('--sr-x',(3+i*3.4)+'%');particle.style.setProperty('--sr-delay',(i%7*.06)+'s');box.appendChild(particle);}
      }
      function commitShow(run){
        if(activeShow!==run||run.finished)return;
        run.finished=true;
        run.waits.forEach((resolve,timer)=>{clearTimeout(timer);resolve(false);});run.waits.clear();
        stagePattern(run,run.target);pushSnapshot(run.before);applyAssignments(run.target);render();
        $('.sr-stage').classList.add('sr-final');$('.sr-count').textContent='';$('.sr-phase').textContent='새로운 자리, 새로운 시작';$('.sr-round').textContent=run.rounds+' / '+run.rounds+' · 최종 발표';$('.sr-meter-fill').style.width='100%';
        $('.sr-skip').hidden=true;$('.sr-cancel').hidden=true;$('.sr-close').hidden=false;makeParticles(run);animateStageCards(run,true);
        [261.63,329.63,392,523.25].forEach((frequency,i)=>tone(run,frequency,.55,i*.11));
        if(run.audio){const audio=run.audio;run.audioCloseTimer=setTimeout(()=>{run.audioCloseTimer=null;if(run.audio===audio){try{audio.close().catch(()=>{});}catch{}run.audio=null;}},1500);}
        $('.sr-close').focus({preventScroll:true});
        publishStage(run);
        bridge.setPresentation(false).catch(()=>{});flushSave().catch(()=>{});
      }
      function leaveStage(cancel=false){
        const run=activeShow;if(!run)return;
        if(cancel&&!run.finished){run.finished=true;stopRunWork(run);}else stopRunWork(run);
        activeShow=null;$('.sr-stage').hidden=true;$('.sr-stage').classList.remove('sr-final');$('.sr-particles').replaceChildren();$('.sr-count').textContent='';
        lockPublic();
        bridge.setPresentation(false).catch(()=>{});queueSave();
        if(pendingStudents().length){$('.sg-status').hidden=false;setStatus('현재 배치에 미배치 학생이 있습니다. 교사 화면에서 확인해 주세요.');}
        $('.sr-reveal').focus({preventScroll:true});
      }
      async function playShow(run){
        try{
          for(let round=1;round<run.rounds;round++){
            if(activeShow!==run||run.finished)return;
            $('.sr-round').textContent=round+' / '+run.rounds;$('.sr-phase').textContent='자리가 움직입니다';$('.sr-meter-fill').style.width=(round/run.rounds*80)+'%';
            stagePattern(run,randomPlan(run.target));animateStageCards(run);tone(run,150+round*32,.12);
            if(!await showWait(run,run.reduced?120:460))return;
          }
          if(activeShow!==run||run.finished)return;
          $('.sr-round').textContent=run.rounds+' / '+run.rounds+' · 마지막';$('.sr-phase').textContent='마지막 자리를 공개합니다';$('.sr-meter-fill').style.width='88%';
          $('.sr-stage-room').querySelectorAll('.sg-seat').forEach(card=>{card.textContent='?';card.setAttribute('aria-label','공개 전 자리');});
          publishStage(run,true);
          if(!await showWait(run,run.reduced?100:650))return;
          for(const count of [3,2,1]){
            if(activeShow!==run||run.finished)return;
            $('.sr-count').textContent=String(count);$('.sr-phase').textContent='최종 공개까지 '+count;tone(run,260+(3-count)*90,.22);
            publishStage(run,true);
            if(!await showWait(run,run.reduced?100:600))return;
          }
          if(activeShow!==run||run.finished)return;
          $('.sr-count').textContent='';commitShow(run);
        }catch(error){if(activeShow===run){leaveStage(true);reportTeacherError('발표를 중단했습니다. '+error.message);}}
      }
      async function beginShow(usePrepared){
        if(activeShow||requestBusy||appRole!=='control')return;
        if(!students.length){reportTeacherError('설정에서 학급 명단을 먼저 입력해 주세요.');return;}
        const rounds=Number($('#sr-rounds').value);if(!Number.isInteger(rounds)||rounds<1||rounds>15){reportTeacherError('발표 횟수는 1~15 사이의 정수로 입력해 주세요.');return;}
        const ticket=++commandEpoch;setRequestBusy(true);
        let target;try{target=await chooseResult(usePrepared);}catch(error){reportTeacherError(error.message,usePrepared);return;}finally{setRequestBusy(false);}
        if(ticket!==commandEpoch)return;
        const run={id:++showSerial,before:snapshot(),target:clone(target),view:teacherView,rounds,reduced:$('#sr-gentle').checked||Boolean(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches),waits:new Map(),animations:[],audio:null,finished:false};
        lockPublic();
        activeShow=run;$('.sr-teacher-error').textContent='';selectedId=null;pendingId=null;
        try{const result=await bridge.setPresentation(true);if(result?.ok===false)throw new Error(result.error||'발표를 시작하지 못했습니다.');}
        catch(error){leaveStage(true);reportTeacherError(error.message);return;}
        if(activeShow!==run||run.finished)return;
        $('.sg-header').hidden=true;$('.sg-work').hidden=true;$('.sg-print').hidden=true;$('.sr-stage').hidden=false;$('.sr-stage').classList.remove('sr-final');$('.sr-stage').classList.toggle('sr-gentle',run.reduced);
        $('.sr-skip').hidden=false;$('.sr-cancel').hidden=false;$('.sr-close').hidden=true;$('.sr-count').textContent='';$('.sr-particles').replaceChildren();$('.sr-meter-fill').style.width='0%';
        stagePattern(run,run.before);$('.sr-skip').focus({preventScroll:true});startAudio(run);playShow(run);
      }
      async function instantShuffle(usePrepared){
        if(activeShow||requestBusy||appRole!=='control')return;
        if(!students.length){reportTeacherError('설정에서 학급 명단을 먼저 입력해 주세요.');return;}
        const ticket=++commandEpoch;setRequestBusy(true);
        let target;try{target=await chooseResult(usePrepared);}catch(error){reportTeacherError(error.message,usePrepared);return;}finally{setRequestBusy(false);}
        if(ticket!==commandEpoch)return;
        pushSnapshot();applyAssignments(target);privateNotice='';lockPublic();finishChange('자리 배치를 바꿨습니다.');
      }
      function showUpdateState(value){
        if(value?.state&&typeof value.state==='object')value=value.state;
        updateState=value||{};const status=value?.status||value?.phase;
        const labels={idle:'자동으로 새 버전을 확인합니다.',checking:'새 버전 확인 중…',available:'새 버전을 내려받습니다.',downloading:'새 버전 다운로드 중…',downloaded:'새 버전 준비 완료',ready:'새 버전 준비 완료',current:'최신 버전입니다.','not-available':'최신 버전입니다.',error:'업데이트를 확인하지 못했습니다. 다시 확인할 수 있습니다.',unconfigured:'배포 저장소 연결이 필요합니다.',portable:'무설치 버전은 새 설치 파일을 받아 교체하세요.',disabled:'이 실행에서는 자동 업데이트를 사용하지 않습니다.'};
        const percent=value?.percent??value?.progress;const detail=status==='downloading'&&Number.isFinite(percent)?' '+Math.round(percent)+'%':'';
        $('.app-update-status').textContent=(value?.message||labels[status]||'자동으로 새 버전을 확인합니다.')+detail;
        $('.app-update-install').hidden=!['downloaded','ready'].includes(status);$('.app-update-check').disabled=['checking','downloading'].includes(status);
      }
      async function runNative(action){
        if(!teacherUnlocked||activeShow||nativeDialogActive)return;
        nativeDialogActive=true;
        try{await flushSave();const result=await action();if(result&&result.ok===false&&!result.cancelled&&!result.canceled)throw new Error(result.error||'작업을 완료하지 못했습니다.');return result;}
        catch(error){if(!$('.sg-print').hidden)$('.sg-print-warning').textContent=error.message;else reportTeacherError(error.message);return null;}
        finally{nativeDialogActive=false;}
      }
      async function saveClassFile(){
        const result=await runNative(()=>bridge.saveFile(snapshot()));if(result?.ok&&!result.cancelled)setStatus('학급 파일을 저장했습니다.');
      }
      async function openClassFile(){
        const result=await runNative(()=>bridge.openFile());
        if(!result?.ok||!result.state)return;
        loadState(result.state);history=[];lastSaved=JSON.stringify(snapshot());pinExists=Boolean(result.pinExists);lockPublic();
      }
      function printOptions(){return {state:snapshot(),type:$('#sg-print-type').value,landscape:$('#app-landscape').checked};}
      async function outputClass(kind){
        if(pendingStudents().length){$('.sg-print-warning').textContent='미배치 학생을 모두 배치한 뒤 출력해 주세요.';return;}
        const result=await runNative(()=>bridge[kind](printOptions()));if(result?.ok&&!result.cancelled){$('.sg-print-warning').textContent='';setStatus('출력 작업을 완료했습니다.');}
      }
      function safeAction(action){return (...args)=>Promise.resolve().then(()=>action(...args)).catch(error=>reportTeacherError(error.message));}
      room.addEventListener('pointerdown',event=>{
        const element=event.target.closest('button[data-seat-id]');if(isPublic||!element||event.button!==0||pendingId)return;
        const seat=findSeat(element.dataset.seatId);if(mode==='student'&&!seat.studentId)return;
        drag={id:seat.id,element,startX:event.clientX,startY:event.clientY,originals:clone(movingSeats(seat.id)),moved:false,pointerId:event.pointerId,targetId:null,before:snapshot()};element.setPointerCapture(event.pointerId);
      });
      room.addEventListener('pointermove',event=>{
        if(!drag||drag.pointerId!==event.pointerId)return;
        const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;if(!drag.moved&&Math.hypot(dx,dy)<5)return;
        drag.moved=true;event.preventDefault();const rect=room.getBoundingClientRect();
        if(mode!=='student'){
          const direction=teacherView?-1:1;moveCollection(drag.originals,direction*dx/rect.width*WIDTH,direction*dy);
          drag.originals.forEach(item=>{const element=room.querySelector('[data-seat-id="'+item.id+'"]');element.classList.add('sg-dragging');positionElement(element,findSeat(item.id),teacherView);});
          [...new Set(drag.originals.map(item=>item.groupId).filter(Boolean))].forEach(groupId=>{
            const label=room.querySelector('[data-group-label="'+groupId+'"]'),members=seats.filter(seat=>seat.groupId===groupId);
            if(label&&members.length)positionElement(label,{x:(Math.min(...members.map(seat=>seat.x))+Math.max(...members.map(seat=>seat.x)))/2,y:Math.min(...members.map(seat=>seat.y))-43},teacherView);
          });
        }else{
          drag.element.classList.add('sg-dragging');drag.element.style.transform='translate(calc(-50% + '+dx+'px),calc(-50% + '+dy+'px))';
          drag.targetId=hitSeat(event.clientX,event.clientY,drag.id);room.querySelectorAll('.sg-seat').forEach(element=>element.classList.toggle('sg-target',element.dataset.seatId===drag.targetId));
        }
      });
      function endDrag(event,cancel){
        if(!drag||drag.pointerId!==event.pointerId)return;const finished=drag;drag=null;
        if(finished.element.hasPointerCapture(event.pointerId))finished.element.releasePointerCapture(event.pointerId);
        if(!finished.moved)return;suppressClick=true;setTimeout(()=>{suppressClick=false;},0);
        if(cancel){finished.originals.forEach(item=>{const seat=findSeat(item.id);seat.x=item.x;seat.y=item.y;});render();return;}
        if(mode==='student'&&finished.targetId){transfer(finished.id,finished.targetId);return;}
        if(mode!=='student'){pushSnapshot(finished.before);selectedId=finished.id;render();focusSeat(finished.id);setStatus(mode==='group'?'모둠 전체 위치를 옮겼습니다.':'책상을 자유 위치로 옮겼습니다.');}
        else{render();setStatus('이동할 책상 위에 놓아 주세요.');}
      }
      room.addEventListener('pointerup',event=>endDrag(event,false));room.addEventListener('pointercancel',event=>endDrag(event,true));
      room.addEventListener('click',event=>{
        if(suppressClick||isPublic)return;const element=event.target.closest('button[data-seat-id]');if(!element)return;const seat=findSeat(element.dataset.seatId);
        if(pendingId){if(seat.studentId){setStatus('미배치 학생은 빈 책상에 놓아 주세요.');return;}pushSnapshot();seat.studentId=pendingId;finishChange(studentLabel(findStudent(pendingId))+' 배치 완료');return;}
        if(mode==='student'&&selectedId&&selectedId!==seat.id&&findSeat(selectedId)?.studentId){transfer(selectedId,seat.id);return;}
        selectedId=selectedId===seat.id?null:seat.id;render();focusSeat(seat.id);
        setStatus(mode==='student'?(seat.studentId?studentLabel(findStudent(seat.studentId))+' 선택 · 이동할 자리 클릭':'빈 책상 선택 · 삭제하거나 학생을 옮길 수 있습니다.'):mode==='group'&&seat.groupId?'선택 모둠을 드래그하거나 방향키로 이동하세요.':'선택 책상을 드래그하거나 방향키로 이동하세요.');
      });
      room.addEventListener('keydown',event=>{
        const element=event.target.closest('button[data-seat-id]');if(!element||mode==='student'||isPublic)return;
        const vectors={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},vector=vectors[event.key];if(!vector)return;
        event.preventDefault();pushSnapshot();const direction=teacherView?-1:1,step=event.shiftKey?15:3;
        moveCollection(clone(movingSeats(element.dataset.seatId)),vector[0]*direction*step,vector[1]*direction*step);selectedId=element.dataset.seatId;render();focusSeat(selectedId);setStatus(mode==='group'?'모둠 위치를 조정했습니다.':'책상 위치를 조정했습니다.');
      });
      namesInput.value='';namesInput.addEventListener('input',updateImportCount);
      $('.sg-import').addEventListener('click',()=>{
        const names=parseNames(namesInput.value);if(!names.length){$('.sg-import-error').textContent='이름을 한 명 이상 입력해 주세요.';return;}
        if(names.length>LIMIT){$('.sg-import-error').textContent=names.length+'명을 인식했습니다. 최대 60명까지 지원하며 기존 명단을 그대로 유지합니다.';return;}
        pushSnapshot();rosterRevision+=1;students=names.map((name,i)=>({id:'p'+i,name}));seats.forEach(seat=>{seat.studentId=null;});
        if(seats.filter(seat=>!seat.temporary).length<students.length){lineCounts=balanced(students.length,draftLines.length);installGeometry(lineGeometry(lineCounts));layoutKind='lines';mode='student';}
        else seats.filter(seat=>!seat.temporary).forEach((seat,i)=>{seat.studentId=students[i]?.id||null;});
        draftLines=balanced(students.length,draftLines.length);draftGroups=balanced(students.length,Math.min(12,Math.max(1,Math.ceil(students.length/5))));syncDraftControls();
        finishChange(names.length+'명을 배치했습니다. 줄·모둠 설정은 적용 버튼을 눌러 바꿀 수 있습니다.');
      });
      root.querySelectorAll('.sg-tabs button').forEach(button=>button.addEventListener('click',()=>switchTab(button.dataset.kind)));
      $('#sg-line-count').addEventListener('change',()=>{draftLines=balanced(regularPopulation(),Number($('#sg-line-count').value));renderCountInputs('lines');updateSummary();});
      $('#sg-group-count').addEventListener('change',()=>{draftGroups=balanced(regularPopulation(),Number($('#sg-group-count').value));renderCountInputs('groups');updateSummary();});
      $('#sg-group-columns').addEventListener('change',()=>{draftColumns=Number($('#sg-group-columns').value);updateSummary();});
      $('#sg-inner-gap').addEventListener('input',()=>{$('#sg-inner-value').textContent=$('#sg-inner-gap').value;updateSummary();});
      $('#sg-outer-gap').addEventListener('input',()=>{$('#sg-outer-value').textContent=$('#sg-outer-gap').value;updateSummary();});
      $('.sg-apply').addEventListener('click',()=>{
        const counts=draftKind==='lines'?draftLines:draftGroups,error=validateCounts(counts,draftKind);if(error){$('.sg-layout-error').textContent=error;return;}
        const inner=Number($('#sg-inner-gap').value),outer=Number($('#sg-outer-gap').value);
        const geometry=draftKind==='lines'?lineGeometry(counts):groupGeometry(counts,inner,outer,draftColumns,draftExtraPositions);
        const regular=seats.filter(seat=>!seat.temporary);
        const preserveGroups=draftKind==='groups'&&layoutKind==='groups'&&pendingStudents().length===0&&regular.length===counts.reduce((a,b)=>a+b,0)&&counts.every((count,index)=>regular.filter(seat=>seat.groupId==='g'+(index+1)).length===count);
        pushSnapshot();installGeometry(geometry,preserveGroups);layoutKind=draftKind;
        if(draftKind==='lines'){lineCounts=[...counts];mode='desk';}else{groupCounts=[...counts];groupExtraPositions=normalizeExtraPositions(counts,draftExtraPositions);groupColumns=draftColumns;appliedInnerGap=inner;appliedOuterGap=outer;mode='group';}
        render();setStatus(draftKind==='lines'?counts.length+'줄로 배치했습니다. 각 책상은 자유롭게 이동할 수 있습니다.':'가로 '+Math.min(groupColumns,counts.length)+'모둠 × 세로 '+Math.ceil(counts.length/Math.min(groupColumns,counts.length))+'단으로 배치했습니다. 모둠을 드래그해 자유롭게 옮겨 보세요.');
      });
      $('.sg-shuffle').addEventListener('click',safeAction(event=>instantShuffle(Boolean(event.ctrlKey))));
      $('.sr-reveal').addEventListener('click',safeAction(event=>beginShow(Boolean(event.ctrlKey))));
      $('.sr-clear').addEventListener('click',safeAction(async()=>{if(activeShow||!teacherUnlocked||!privateAccess)return;const epoch=accessEpoch,result=await bridge.clearPrepared();if(epoch!==accessEpoch||!privateAccess)return;if(!result.ok)throw new Error(result.error);preparedAssignments=null;preparedSignature=null;privateNotice='';updatePreparedStatus();$('.sp-draft-status').textContent='저장한 준비 배정을 해제했습니다. 현재 편집 내용은 저장 전까지 적용되지 않습니다.';}));
      $('.sp-settings-open').addEventListener('click',()=>openSettings());
      $('.sp-private-trigger').addEventListener('click',()=>handleBrandTap());
      $('.sp-auth-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;try{if(button)button.disabled=true;$('.sp-auth-error').textContent=await unlockSettings($('#sp-pin').value,$('#sp-pin-confirm').value);}catch(error){$('.sp-auth-error').textContent=error.message;}finally{if(button)button.disabled=false;}});
      $('.sp-auth-cancel').addEventListener('click',lockPublic);
      $('.sp-save').addEventListener('click',safeAction(saveAssignmentDraft));
      $('.sp-discard').addEventListener('click',()=>{if(!teacherUnlocked)return;clearPrivateDraft();$('.sg-header').hidden=false;$('.sg-work').hidden=false;render();});
      $('.sp-lock').addEventListener('click',lockPublic);
      $('.sr-skip').addEventListener('click',()=>{if(activeShow)commitShow(activeShow);});
      $('.sr-cancel').addEventListener('click',()=>leaveStage(true));
      $('.sr-close').addEventListener('click',()=>leaveStage(false));
      window.addEventListener('keydown',event=>{
        if(appRole==='display')return;
        if(event.ctrlKey&&event.altKey&&event.code==='KeyK'){event.preventDefault();openSettings();return;}
        if(event.ctrlKey&&!event.altKey&&event.code==='KeyS'&&teacherUnlocked){event.preventDefault();saveClassFile();return;}
        if(event.key==='Escape'){event.preventDefault();commandEpoch+=1;if(activeShow)leaveStage(!activeShow.finished);else lockPublic();}
      });
      window.addEventListener('blur',()=>{brandTaps=[];if((teacherUnlocked||!$('.sp-auth').hidden)&&!activeShow&&!nativeDialogActive)lockPublic();});
      window.addEventListener('pagehide',()=>{if(activeShow){activeShow.finished=true;stopRunWork(activeShow);activeShow=null;}lockPublic();});
      ['student','desk','group'].forEach(value=>$('.sg-mode-'+value).addEventListener('click',()=>{mode=value;selectedId=null;pendingId=null;render();}));
      $('.sg-add').addEventListener('click',()=>{
        if(seats.filter(seat=>!seat.temporary).length>=LIMIT){setStatus('일반 책상은 최대 60개까지 추가할 수 있습니다.');return;}
        const selected=findSeat(selectedId),groupId=selected?.groupId||null;
        let candidate=null;
        const xs=selected?[selected.x+deskWidth+8,selected.x-deskWidth-8,selected.x]:[];
        const ys=selected?[selected.y,selected.y+DESK_HEIGHT+8,selected.y-DESK_HEIGHT-8]:[];
        for(let y=165;y<worldHeight-DESK_HEIGHT/2;y+=16)ys.push(y);
        for(let x=deskWidth/2+12;x<WIDTH-deskWidth/2;x+=20)xs.push(x);
        outer:for(const y of ys){for(const x of xs){if(x<deskWidth/2+5||x>WIDTH-deskWidth/2-5||y<155||y>worldHeight-DESK_HEIGHT/2-8)continue;
          if(!seats.some(seat=>Math.abs(seat.x-x)<((seat.temporary?130:deskWidth)+deskWidth)/2+4&&Math.abs(seat.y-y)<DESK_HEIGHT+4)){candidate={x,y};break outer;}}}
        pushSnapshot();if(!candidate){worldHeight+=80;candidate={x:WIDTH/2,y:worldHeight-45};}
        const seat=newSeat(candidate.x,candidate.y,groupId);seats.push(seat);selectedId=seat.id;pendingId=null;mode='desk';render();setStatus(groupId?groupId.slice(1)+'모둠에 빈 책상을 추가했습니다.':'빈 책상을 추가했습니다. 원하는 위치로 옮겨 보세요.');
      });
      $('.sg-delete').addEventListener('click',()=>{
        const seat=findSeat(selectedId);if(!seat)return;const name=seat.studentId?studentLabel(findStudent(seat.studentId)):null;
        pushSnapshot();seats=seats.filter(item=>item.id!==seat.id);finishChange(name?name+'의 책상을 삭제했습니다. 학생은 아래 미배치 목록에 유지됩니다.':'선택한 책상을 삭제했습니다.');
      });
      $('.sg-clear-empty').addEventListener('click',()=>{const removed=seats.filter(seat=>!seat.temporary&&!seat.studentId).length;if(!removed)return;pushSnapshot();seats=seats.filter(seat=>seat.temporary||seat.studentId);finishChange('빈 일반 책상 '+removed+'개를 삭제했습니다.');});
      $('.sg-undo').addEventListener('click',()=>{
        if(!history.length)return;const previous=history.pop();({students,seats,serial,worldHeight,deskWidth,layoutKind,lineCounts,groupCounts,groupColumns,appliedInnerGap,appliedOuterGap}=previous);
        groupExtraPositions=normalizeExtraPositions(groupCounts,previous.groupExtraPositions);
        namesInput.value=students.map(student=>student.name).join('\n');draftLines=[...lineCounts];draftGroups=[...groupCounts];draftExtraPositions=[...groupExtraPositions];draftColumns=groupColumns;
        $('#sg-inner-gap').value=String(appliedInnerGap);$('#sg-outer-gap').value=String(appliedOuterGap);$('#sg-inner-value').textContent=String(appliedInnerGap);$('#sg-outer-value').textContent=String(appliedOuterGap);
        syncDraftControls();switchTab(layoutKind);updateImportCount();mode=layoutKind==='groups'?'group':'student';finishChange('이전 배치로 되돌렸습니다.');
      });
      $('.sg-view-student').addEventListener('click',()=>{teacherView=false;selectedId=null;render();});$('.sg-view-teacher').addEventListener('click',()=>{teacherView=true;selectedId=null;render();});
      $('.sg-public-toggle').addEventListener('click',lockPublic);
      $('#app-class-name').addEventListener('change',()=>{className=$('#app-class-name').value.trim()||'우리 반';$('#app-class-name').value=className;render();});
      ['#sr-rounds','#sr-sound','#sr-gentle','#app-landscape'].forEach(selector=>$(selector).addEventListener('change',()=>{if(selector==='#sr-rounds'){const value=Number($('#sr-rounds').value);if(!Number.isInteger(value)||value<1||value>15){$('#sr-rounds').value='7';reportTeacherError('발표 횟수는 1~15회입니다.');}}queueSave();}));
      $('.app-save').addEventListener('click',saveClassFile);$('.app-open').addEventListener('click',openClassFile);
      $('.app-print-now').addEventListener('click',()=>outputClass('print'));$('.app-pdf').addEventListener('click',()=>outputClass('exportPDF'));$('.app-png').addEventListener('click',()=>outputClass('exportPNG'));
      $('.app-display').addEventListener('click',()=>runNative(()=>bridge.openDisplay(snapshot())));
      $('.app-fullscreen').addEventListener('click',()=>runNative(()=>bridge.toggleFullscreen()));
      $('.app-update-check').addEventListener('click',()=>runNative(async()=>{const result=await bridge.checkUpdate();showUpdateState(await bridge.getUpdateState());return result;}));
      $('.app-update-install').addEventListener('click',()=>runNative(()=>bridge.installUpdate()));
      $('.app-append').addEventListener('click',()=>{
        if(!teacherUnlocked)return;const names=parseNames(namesInput.value);if(!names.length||students.length+names.length>LIMIT){$('.sg-import-error').textContent='추가 후 총 인원은 1~60명이어야 합니다.';return;}
        pushSnapshot();rosterRevision+=1;const extra=names.map((name,i)=>({id:'p'+Date.now()+'-'+i,name}));students.push(...extra);
        const empty=seats.filter(seat=>!seat.temporary&&!seat.studentId);extra.forEach((student,i)=>{if(empty[i])empty[i].studentId=student.id;});
        namesInput.value='';updateImportCount();finishChange(names.length+'명을 추가했습니다. 남은 학생은 미배치 목록에서 확인하세요.');
      });
      $('.app-add-temp').addEventListener('click',()=>{
        if(!teacherUnlocked)return;if(seats.length>=80){setStatus('전체 책상은 최대 80개입니다.');return;}
        let point=null;for(let y=101;y<worldHeight-32&&!point;y+=70){for(let x=80;x<=920;x+=140){if(y<155&&x>345&&x<655)continue;if(!seats.some(seat=>Math.abs(seat.x-x)<140&&Math.abs(seat.y-y)<60)){point={x,y};break;}}}
        pushSnapshot();if(!point){worldHeight+=80;point={x:500,y:worldHeight-45};}const seat={...newSeat(point.x,point.y),temporary:true};seats.push(seat);selectedId=seat.id;mode='desk';render();setStatus('임시 자리를 추가했습니다. 비어 있으면 공개 화면과 인쇄에서 표시하지 않습니다.');
      });
      function renderPrint(){
        const kind=$('#sg-print-type').value,pages=$('.sg-print-pages');pages.replaceChildren();pages.classList.toggle('sg-both',kind==='both');
        $('.sg-print-warning').textContent=pendingStudents().length?'미배치 학생 '+pendingStudents().length+'명이 자리표에서 빠져 있습니다. 배치 화면에서 확인하세요.':'';
        (kind==='both'?['student','teacher']:[kind]).forEach(view=>{
          const page=document.createElement('section');page.className='sg-print-page';const title=document.createElement('h2');title.textContent=className+' · '+(view==='teacher'?'교탁용':'학생용');page.appendChild(title);
          const preview=document.createElement('div');preview.className='sg-room sg-print-room';preview.setAttribute('aria-label',title.textContent+' 인쇄 배치');page.appendChild(preview);pages.appendChild(page);renderRoom(preview,view==='teacher',false);
        });
      }
      $('.sg-print-open').addEventListener('click',()=>{$('.sg-work').hidden=true;$('.sg-print').hidden=false;renderPrint();});$('.sg-print-close').addEventListener('click',()=>{$('.sg-print').hidden=true;$('.sg-work').hidden=false;});$('#sg-print-type').addEventListener('change',renderPrint);
      installGeometry(groupGeometry(groupCounts,appliedInnerGap,appliedOuterGap,groupColumns,groupExtraPositions));
      seats.push({id:'t-left',x:185,y:101,temporary:true,studentId:null,groupId:null},{id:'t-right',x:815,y:101,temporary:true,studentId:null,groupId:null});
      async function initialize(){
        try{
          const initial=await bridge.getInitial();appRole=initial.role||'control';pinExists=Boolean(initial.pinExists);$('.app-version').textContent='v'+initial.version;
          if(initial.state)loadState(initial.state);else{syncDraftControls();switchTab('groups');updateImportCount();}
          ready=true;render();
          if(appRole==='control'){
            bridge.onUpdate(showUpdateState);
            if(bridge.onBeforeClose)bridge.onBeforeClose(async()=>{try{if(activeShow&&!activeShow.finished)leaveStage(true);await flushSave();bridge.closeReady({ok:true});}catch(error){bridge.closeReady({ok:false,error:error.message});}});
          }else{
            bridge.onDisplay(receiveDisplay);if(initial.state?.presentation)receiveDisplay(initial.state);
          }
        }catch(error){$('.sg-status').hidden=false;setStatus('프로그램을 시작하지 못했습니다. '+error.message);}
      }
      initialize();
    })();
  
