var getUrlParameter = function getUrlParameter(sParam) {
    var sPageURL = decodeURIComponent(window.location.search.substring(1)),
        sURLVariables = sPageURL.split('&'),
        sParameterName,
        i;

    for (i = 0; i < sURLVariables.length; i++) {
        sParameterName = sURLVariables[i].split('=');

        if (sParameterName[0] === sParam) {
            return sParameterName[1] === undefined ? true : sParameterName[1];
        }
    }
};

$(document).ready(function() {
  var data_token; 
  var id = getUrlParameter("id");
  var authKey = getUrlParameter("key");
  var url = '/oauth/userdata/' + id + '/' + authKey;
  $.getJSON(url, function(data) {
    if (data["ok"] == true) {
      $('#full_name').html(data["name"]);
      $('#department').html(data["department"]);
    }
    
    
    
    
  });
  
  
  

  
});